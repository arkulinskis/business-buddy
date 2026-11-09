"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r

def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- library: views, votes, bookmarks
as_user(None)
DD = M["DemoData"]
st = ok(call("page_state", "guide", "barber-shop"))
assert DD.state() == "loaded", "demo loads on first visit"
demo_views = DD.DEMO_VIEWS["guide"]["barber-shop"]
assert st["views"] == demo_views + 1 and st["saved"] is False and st["plan"] is None and st["my_vote"] is None
ok(call("page_state", "guide", "barber-shop"))
assert call("page_state", "guide", "barber-shop")["views"] == demo_views + 1, "one view per page per session"
bad(call("page_state", "guide", "../etc"))
bad(call("page_state", "recipe", "barber-shop"))
v = ok(call("vote", "guide", "barber-shop", True))
assert v["my_vote"] is True and v["votes"] == 2
v = ok(call("vote", "guide", "barber-shop", False))
assert v["votes"] == 2 and v["helpful"] == 1, "a guest changes their vote instead of voting twice"
assert call("page_state", "guide", "barber-shop")["my_vote"] is False
bad(call("vote", "topic", "Bad Slug", True))
assert denied("toggle_save", "guide", "bakery")
pop = call("get_popular")["guides"]
assert pop[0]["slug"] == "barber-shop"
as_user(ana)
assert ok(call("toggle_save", "guide", "bakery"))["saved"] is True
assert ok(call("toggle_save", "topic", "gst-qst"))["saved"] is True
assert call("page_state", "guide", "bakery")["saved"] is True
assert ok(call("toggle_save", "guide", "bakery"))["saved"] is False
bad(call("toggle_save", "guide", "NOPE!"))
ok(call("vote", "topic", "gst-qst", True))
ok(call("vote", "topic", "gst-qst", True))
assert len(T.votes.search(user=ana)) == 1, "one vote per member per page"

# ---------------------------------------------------------------------------------- plans
as_user(None)
for fn, args in [("list_plans", ()), ("create_plan", ("bakery", "X")), ("get_plan", ("x",)), ("set_task", ("x", "idea.talk", True)),
                 ("set_note", ("x", "idea.talk", "n")), ("save_costs", ("x", [])), ("update_plan", ("x", "T")), ("delete_plan", ("x",)), ("get_home", ())]:
    assert denied(fn, *args), fn
as_user(ana)
bad(call("create_plan", "", "My bakery"))
bad(call("create_plan", "bakery", " "))
bad(call("create_plan", "bakery", "Pain Perdu", "Verdun", "31/12/2026"))
p = ok(call("create_plan", "bakery", "  Pain   Perdu ", "Verdun", "2027-03-01",
             [{"label": "Oven", "amount": "12000", "kind": "once"}, {"label": "Rent", "amount": 2500, "kind": "monthly"}, "junk", {"amount": -5}]))["plan"]
assert p["title"] == "Pain Perdu" and p["target_date"] == "2027-03-01" and p["cost_once"] == 12000 and p["cost_monthly"] == 2500
assert len(p["costs"]) == 2, "junk and empty cost rows are dropped, not trusted"
pid = p["id"]
assert ok(call("set_task", pid, "idea.talk", True))["done_count"] == 1
ok(call("set_task", pid, "idea.talk", True))
assert ok(call("set_task", pid, "bakery.kitchen", True))["done"] == ["idea.talk", "bakery.kitchen"], "ticking twice doesn't duplicate"
assert ok(call("set_task", pid, "idea.talk", False))["done"] == ["bakery.kitchen"]
bad(call("set_task", pid, "<script>", True))
ok(call("set_note", pid, "idea.talk", "Called 12 people.\nMost want sourdough."))
assert call("get_plan", pid)["plan"]["notes"] == {"idea.talk": "Called 12 people.\nMost want sourdough."}
ok(call("set_note", pid, "idea.talk", "  "))
assert call("get_plan", pid)["plan"]["notes"] == {}, "an empty note removes it"
saved = ok(call("save_costs", pid, [{"label": "Mixer", "amount": 4200.555, "kind": "once"}]))["plan"]
assert saved["costs"] == [{"label": "Mixer", "amount": 4200.56, "kind": "once"}]
bad(call("save_costs", pid, "not a list"))
bad(call("save_costs", pid, [{"label": "x", "amount": 1}] * 61))
up = ok(call("update_plan", pid, "Boulangerie Pain Perdu", "Verdun", "", True))["plan"]
assert up["hiring"] is True and up["target_date"] is None and up["title"] == "Boulangerie Pain Perdu"
bad(call("update_plan", pid, "B", "Verdun", "2027-01-01"))
bad(call("update_plan", pid, "Bakery", "Verdun", "1800-01-01"))
assert call("page_state", "guide", "bakery")["plan"]["id"] == pid, "the guide page knows your plan"
home = call("get_home")
assert [x["id"] for x in home["plans"]] == [pid] and home["saved"][0]["slug"] == "gst-qst" and home["builders"] >= 5
assert len(call("list_plans")["plans"]) == 1
as_user(bob)
for fn, args in [("get_plan", (pid,)), ("set_task", (pid, "idea.talk", True)), ("set_note", (pid, "idea.talk", "x")),
                 ("save_costs", (pid, [])), ("update_plan", (pid, "Mine now"))]:
    bad(call(fn, *args), "bob can't touch Ana's plan: " + fn)
ok(call("delete_plan", pid))
assert T.plans.get_by_id(pid) is not None, "deleting someone else's plan does nothing"
assert call("list_plans")["plans"] == []
for i in range(12):
    ok(call("create_plan", "cleaning", "Plan %d" % i))
bad(call("create_plan", "cleaning", "One too many"), "plan limit")
for r in T.plans.search(owner=bob):
    r.delete()
as_user(ana)
ok(call("delete_plan", pid))
assert call("list_plans")["plans"] == []

# ---------------------------------------------------------------------------------- admin content + demo data
as_user(ana)
assert denied("admin_content")
as_user(admin)
ov = call("admin_overview")
assert ov["plans"] == 0 and ov["votes"] == 2, ov
rows = {r["kind"] + ":" + r["slug"]: r for r in call("admin_content")["pages"]}
assert rows["guide:barber-shop"]["views"] == demo_views + 1 and rows["guide:barber-shop"]["down"] == 1
assert rows["guide:bakery"]["plans"] == 1, "demo plans count"
as_user(ana)
ok(call("create_plan", "cafe", "Café Ana"))
as_user(admin)
ok(call("demo_remove"))
assert DD.state() == "removed" and not T.users.search(is_demo=True)
assert len(T.plans.search()) == 1 and len(T.saved.search()) == 1, "removing demo data keeps real data"
assert call("page_state", "guide", "barber-shop")["views"] == 2, "demo views removed, real views kept (guest + this admin visit)"
as_user(None)
call("get_popular")
assert DD.state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load"))
ok(call("demo_load"))
assert len(T.plans.search(is_demo=True)) == len(DD.DEMO_PLANS), "reloading replaces the demo instead of doubling it"
# every demo task id exists in the content (the browser's checklist ids)
import re as _re  # noqa: E402
content = (PROJECT / "theme" / "assets" / "bb.js").read_text(encoding="utf-8")  # the knowledge base engine
known = set(_re.findall(r"id: '([a-z0-9.\-]+)'", content))
slugs = set(_re.findall(r"slug: '([a-z0-9\-]+)'", content))
for plan in DD.DEMO_PLANS:
    assert plan[1] in slugs, "demo plan guide %s missing from the content" % plan[1]
    for t in plan[5]:
        assert t in known, "demo task id %s missing from the content" % t
for kind, views in DD.DEMO_VIEWS.items():
    for s in views:
        assert s in slugs, "demo view slug %s missing from the content" % s

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"get_me", "submit_feedback", "legal_state", "legal_accept", "page_state", "vote", "get_popular"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
