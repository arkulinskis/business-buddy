"""Personal launch plans: one per business someone is preparing (built from a guide).

A plan stores which checklist tasks are done (task ids come from the guide content in the browser), a note
per task, a startup cost sheet and a target opening date. Only the owner can see or change a plan.
Also get_home: everything the signed-in dashboard needs in one call.
"""
import datetime as dt
import re

import anvil.server
from anvil.tables import app_tables

from . import common as C
from . import DemoData, Library

TASK = re.compile(r"^[a-z0-9][a-z0-9.\-]{1,60}$")
MAX_PLANS = 12
MAX_COST_ROWS = 60


def _date(value):
    """'YYYY-MM-DD' -> date, '' / None -> None, anything else -> False (invalid)."""
    if value in (None, ""):
        return None
    try:
        d = dt.date.fromisoformat(str(value)[:10])
    except ValueError:
        return False
    if d.year < 2000 or d.year > 2100:
        return False
    return d


def _costs(rows):
    """Clean a cost sheet from the browser: [{label, amount, kind: 'once'|'monthly'}]."""
    out = []
    for r in (rows or [])[:MAX_COST_ROWS]:
        if not isinstance(r, dict):
            continue
        label = C.text(r.get("label"), 80)
        try:
            amount = round(float(r.get("amount") or 0), 2)
        except (TypeError, ValueError):
            amount = 0
        amount = max(0, min(amount, 10000000))
        if label or amount:
            out.append({"label": label or "Item", "amount": amount, "kind": "monthly" if r.get("kind") == "monthly" else "once"})
    return out


def plan_dict(r, full=False):
    done = list(r["done"] or [])
    d = {"id": r.get_id(), "guide": r["guide"], "title": r["title"], "area": r["area"] or "",
         "target_date": C.iso(r["target_date"]), "done": done, "done_count": len(done), "hiring": bool(r["hiring"]),
         "created": C.iso(r["created"]), "updated": C.iso(r["updated"]), "demo": bool(r["is_demo"])}
    costs = list(r["costs"] or [])
    d["cost_once"] = round(sum(c.get("amount", 0) for c in costs if c.get("kind") != "monthly"), 2)
    d["cost_monthly"] = round(sum(c.get("amount", 0) for c in costs if c.get("kind") == "monthly"), 2)
    if full:
        d["notes"] = dict(r["notes"] or {})
        d["costs"] = costs
    return d


def _mine(plan_id):
    me = C.require_user()
    r = C.row_by_id(app_tables.plans, plan_id)
    if r is None or r["owner"] != me:
        return None
    return r


def _touch(r):
    r["updated"] = C.now()


@anvil.server.callable(require_user=True)
def list_plans():
    me = C.require_user()
    rows = sorted(app_tables.plans.search(owner=me), key=lambda r: r["updated"] or r["created"], reverse=True)
    return {"plans": [plan_dict(r) for r in rows]}


@anvil.server.callable(require_user=True)
def create_plan(guide, title, area=None, target_date=None, costs=None):
    me = C.require_user()
    if not Library.valid("guide", guide):
        return C.fail("Pick a business type for this plan.")
    title = C.text(title, 80)
    if len(title) < 2:
        return C.fail("Give your plan a name (at least 2 characters).")
    when = _date(target_date)
    if when is False:
        return C.fail("That opening date doesn't look right.")
    if len(app_tables.plans.search(owner=me)) >= MAX_PLANS:
        return C.fail("You already have %d plans. Delete one you don't need first." % MAX_PLANS)
    if C.rate_limited("create_plan", 20, 3600):
        return C.fail("That's a lot of new plans in one hour. Try again a bit later.")
    r = app_tables.plans.add_row(owner=me, guide=guide, title=title, area=C.text(area, 60), target_date=when,
                                 done=[], notes={}, costs=_costs(costs), hiring=False,
                                 created=C.now(), updated=C.now(), is_demo=False)
    return C.ok(plan=plan_dict(r, full=True))


@anvil.server.callable(require_user=True)
def get_plan(plan_id):
    r = _mine(plan_id)
    if r is None:
        return C.fail("That plan doesn't exist, or it isn't yours.")
    return C.ok(plan=plan_dict(r, full=True))


@anvil.server.callable(require_user=True)
def set_task(plan_id, task, done):
    r = _mine(plan_id)
    if r is None:
        return C.fail("That plan doesn't exist, or it isn't yours.")
    if not isinstance(task, str) or not TASK.match(task):
        return C.fail("Unknown task.")
    have = [t for t in (r["done"] or []) if t != task]
    if done:
        if len(have) >= 400:
            return C.fail("This plan has too many ticked tasks.")
        have.append(task)
    r["done"] = have
    _touch(r)
    return C.ok(done=have, done_count=len(have))


@anvil.server.callable(require_user=True)
def set_note(plan_id, task, note):
    r = _mine(plan_id)
    if r is None:
        return C.fail("That plan doesn't exist, or it isn't yours.")
    if not isinstance(task, str) or not TASK.match(task):
        return C.fail("Unknown task.")
    notes = dict(r["notes"] or {})
    note = C.text(note, 1500, multiline=True)
    if note:
        if task not in notes and len(notes) >= 300:
            return C.fail("This plan has too many notes.")
        notes[task] = note
    else:
        notes.pop(task, None)
    r["notes"] = notes
    _touch(r)
    return C.ok(note=note)


@anvil.server.callable(require_user=True)
def save_costs(plan_id, costs):
    r = _mine(plan_id)
    if r is None:
        return C.fail("That plan doesn't exist, or it isn't yours.")
    if not isinstance(costs, list):
        return C.fail("The cost sheet didn't come through. Try again.")
    if len(costs) > MAX_COST_ROWS:
        return C.fail("A cost sheet can have up to %d lines." % MAX_COST_ROWS)
    r["costs"] = _costs(costs)
    _touch(r)
    return C.ok(plan=plan_dict(r, full=True))


@anvil.server.callable(require_user=True)
def update_plan(plan_id, title, area=None, target_date=None, hiring=False):
    r = _mine(plan_id)
    if r is None:
        return C.fail("That plan doesn't exist, or it isn't yours.")
    title = C.text(title, 80)
    if len(title) < 2:
        return C.fail("Give your plan a name (at least 2 characters).")
    when = _date(target_date)
    if when is False:
        return C.fail("That opening date doesn't look right.")
    r.update(title=title, area=C.text(area, 60), target_date=when, hiring=bool(hiring))
    _touch(r)
    return C.ok(plan=plan_dict(r, full=True))


@anvil.server.callable(require_user=True)
def delete_plan(plan_id):
    r = _mine(plan_id)
    if r is None:
        return C.ok()
    r.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def get_home():
    """The signed-in dashboard: your plans, saved pages, and what other people are reading."""
    DemoData.ensure_loaded()
    me = C.require_user()
    rows = sorted(app_tables.plans.search(owner=me), key=lambda r: r["updated"] or r["created"], reverse=True)
    return {"plans": [plan_dict(r) for r in rows], "saved": Library.saved_list(me), "popular": Library.popular(6),
            "builders": len(set(r["owner"].get_id() for r in app_tables.plans.search() if r["owner"] is not None))}
