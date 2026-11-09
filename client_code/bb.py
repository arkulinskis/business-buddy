"""Python side of the knowledge base (theme/assets/bb.js, window.BB). The guides, topics, permits, glossary and the
launch checklist stay in JavaScript, unchanged from the JS version; everything crosses as JSON text, so pages get
plain dicts and lists.

    bb.DATA                    updated, categories, phases, permits, glossary, sources, stages, boroughs,
                               guides (summaries), topics (summaries)
    bb.guide(slug)             the full guide (intro/rules/money are HTML) or None; bb.topic(slug) the same
    bb.guide_info(slug)        the summary (name, icon, cat, glance ...) or None; bb.topic_info(slug), bb.category(id)
    bb.phases(slug, hiring)    the plan checklist [{id, name, icon, blurb, tasks: [{id, t, d, topic, special}]}]
    bb.progress(plan)          {done, total, pct};  bb.next_tasks(plan, n) [{t, phase}]
    bb.search(q)               hits [{kind: guide|topic|term, name, tagline, slug, icon, cat}]
    bb.money / kmoney / cost_range / weeks / diff_label / days_until     formatting like the JS version
    bb.store_get/store_set     this browser's storage as real dicts (same keys as the JS version: finder, be, tx ...)
    bb.street()                the storefront street drawing (SVG text, follows light/dark through CSS)
"""
import datetime
import json
import math

from anvil.js import window

DATA: dict = json.loads(window.BB.json.data())
_GUIDES = {g["slug"]: g for g in DATA["guides"]}
_TOPICS = {t["slug"]: t for t in DATA["topics"]}
_CATS = {c["id"]: c for c in DATA["categories"]}
DIFFICULTY = ["", "Easy start", "Approachable", "Moderate", "Demanding", "Expert"]
# licences that make a business "not a plain start" (the library's "No trade licence" filter)
SPECIAL = ["mapaqRestaurant", "mapaqRetail", "racj", "rbq", "cmeq", "cmmtq", "daycare", "tobacco", "dogwalker", "autoDecree"]


def guide(slug):
    return json.loads(window.BB.json.guide(slug or ""))


def topic(slug):
    return json.loads(window.BB.json.topic(slug or ""))


def guide_info(slug):
    return _GUIDES.get(slug or "")


def topic_info(slug):
    return _TOPICS.get(slug or "")


def category(cat_id):
    return _CATS.get(cat_id or "")


def stage(stage_id):
    for s in DATA["stages"]:
        if s["id"] == stage_id:
            return s
    return None


def phases(slug, hiring=False):
    return json.loads(window.BB.json.phases(slug or "", bool(hiring)))


def _plan_json(plan):
    return json.dumps({"guide": plan.get("guide"), "hiring": bool(plan.get("hiring")), "done": list(plan.get("done") or [])})


def progress(plan):
    return json.loads(window.BB.json.progress(_plan_json(plan)))


def next_tasks(plan, n=3):
    return json.loads(window.BB.json.next(_plan_json(plan), n))


def starter_costs(slug):
    return json.loads(window.BB.json.starterCosts(slug or ""))


def search(q):
    return json.loads(window.BB.json.search(q or ""))


def norm(text):
    """Lower case without accents ("Ré" -> "re"): Skulpt has no unicodedata, so the engine does it."""
    return str(window.BB.json.norm(text or ""))


def street():
    return str(window.BB.street())


# ---------------------------------------------------------------- formatting (same output as the JS version)
def money(n, cents=False):
    """'$1,234' (whole dollars from $100 up) or '$12.50'; cents=True always shows cents when there are any."""
    try:
        n = float(n or 0)
    except (TypeError, ValueError):
        n = 0.0
    neg = n < 0
    n = abs(n)
    if not cents and n >= 100:
        s = "{:,.0f}".format(n)
    elif cents:
        s = "{:,.2f}".format(n)
    else:
        s = "{:,.2f}".format(n) if n % 1 else "{:,.0f}".format(n)
    return ("-$" if neg else "$") + s


def _round(x):
    """Math.round (halves go up), not Python's round-half-even."""
    return int(math.floor(x + 0.5))


def kmoney(n):
    n = float(n or 0)
    if n >= 1000:
        k = _round(n / 1000 * 10) / 10 if n < 10000 else _round(n / 1000)
        return "$%sk" % (str(int(k)) if k == int(k) else str(k))
    return "$%d" % _round(n)


def cost_range(r):
    return kmoney(r[0]) + "–" + kmoney(r[1])


def weeks(w):
    if w[1] <= 8:
        return "%d–%d weeks" % (w[0], w[1])
    return "%d–%d months" % (max(1, _round(w[0] / 4.3)), _round(w[1] / 4.3))


def diff_label(n):
    return DIFFICULTY[n] if 0 <= n < len(DIFFICULTY) else ""


def days_until(iso):
    if not iso:
        return None
    try:
        d = datetime.date(int(iso[0:4]), int(iso[5:7]), int(iso[8:10]))
    except (TypeError, ValueError):
        return None
    return (d - datetime.date.today()).days


def number(text):
    """A number typed in a field ('1 200', '$35'); 0 when it isn't one."""
    keep = "".join(ch for ch in str(text if text is not None else "") if ch.isdigit() or ch in ".-")
    try:
        return float(keep) if keep not in ("", "-", ".") else 0.0
    except ValueError:
        return 0.0


def fmt_num(n):
    """A stored number back into a field: 4500.0 -> '4500'."""
    return ("%d" % n) if float(n) == int(n) else ("%s" % n)


# ---------------------------------------------------------------- browser storage as real dicts
KEY = "businessbuddy."  # UI.config.key in app-kit.js


def store_get(key, default=None):
    try:
        raw = window.localStorage.getItem(KEY + key)
    except Exception:
        return default
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except ValueError:
        return default


def store_set(key, value):
    try:
        window.localStorage.setItem(KEY + key, json.dumps(value))
    except Exception:
        pass


def children(node):
    """The element children of a DOM node as a list (untyped, so the validator doesn't object to indexing)."""
    kids = node.children
    return [kids[i] for i in range(kids.length)]
