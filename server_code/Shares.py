"""Read-only plan links for an advisor (PME MTL, Futurpreneur, an accountant, a friend who has done it).

The owner makes a link on a plan (#plan/<id> -> "Share with an advisor"); anyone with it opens #shared/<token> and sees
the checklist read-only: ticks, the guide, borough and opening date, the notes only if the owner switched them on.
Never an email: the page shows the owner's first name only (or nothing). Stop sharing turns the link off at once
(revoked rows stay, so an old link says "turned off" instead of "doesn't exist"). One live link per plan.
Table plan_shares (plan, owner, token, show_notes, views, revoked, created, last_viewed, is_demo). Until the user
accepts the Schema Mismatch, the table is missing: every call answers "being set up" instead of failing.
"""
import re
import secrets

import anvil.server
from anvil.tables import app_tables

from . import common as C
from . import Plans

TOKEN = re.compile(r"^[A-Za-z0-9_\-]{16,64}$")
SETUP = "Sharing is being set up. Please try again in a little while."


def _table():
    try:
        return getattr(app_tables, "plan_shares")
    except Exception:
        return None


def _live(tbl, plan_row):
    for r in tbl.search(plan=plan_row, revoked=False):
        return r
    return None


def share_dict(r):
    return {"token": r["token"], "show_notes": bool(r["show_notes"]), "views": int(r["views"] or 0),
            "created": C.iso(r["created"]), "last_viewed": C.iso(r["last_viewed"])}


def first_name(user):
    """A first name for the shared page: the display name's first word, never anything from the email."""
    name = (user["display_name"] or "").strip() if user is not None else ""
    return name.split()[0][:40] if name else ""


@anvil.server.callable(require_user=True)
def get_share(plan_id):
    """The plan's live link, if any (the Share dialog opens with it)."""
    r = Plans._mine(plan_id)
    if r is None:
        return C.fail("That plan doesn't exist, or it isn't yours.")
    tbl = _table()
    if tbl is None:
        return C.fail(SETUP)
    try:
        s = _live(tbl, r)
    except Exception:
        return C.fail(SETUP)
    return C.ok(share=share_dict(s) if s else None)


@anvil.server.callable(require_user=True)
def create_share(plan_id, show_notes=False):
    """Make the plan's read-only link (or return the live one)."""
    me = C.require_user()
    r = Plans._mine(plan_id)
    if r is None:
        return C.fail("That plan doesn't exist, or it isn't yours.")
    tbl = _table()
    if tbl is None:
        return C.fail(SETUP)
    try:
        s = _live(tbl, r)
        if s is None:
            if C.rate_limited("create_share", 20, 3600):
                return C.fail("That's a lot of new links in one hour. Try again a bit later.")
            s = tbl.add_row(plan=r, owner=me, token=secrets.token_urlsafe(18), show_notes=bool(show_notes), views=0,
                            revoked=False, created=C.now(), last_viewed=None, is_demo=False)
        return C.ok(share=share_dict(s))
    except Exception:
        return C.fail(SETUP)


@anvil.server.callable(require_user=True)
def set_share_notes(plan_id, show_notes):
    r = Plans._mine(plan_id)
    if r is None:
        return C.fail("That plan doesn't exist, or it isn't yours.")
    tbl = _table()
    if tbl is None:
        return C.fail(SETUP)
    try:
        s = _live(tbl, r)
        if s is None:
            return C.fail("This plan isn't shared right now.")
        s["show_notes"] = bool(show_notes)
        return C.ok(share=share_dict(s))
    except Exception:
        return C.fail(SETUP)


@anvil.server.callable(require_user=True)
def revoke_share(plan_id):
    """Stop sharing: every link of this plan stops working at once."""
    r = Plans._mine(plan_id)
    if r is None:
        return C.fail("That plan doesn't exist, or it isn't yours.")
    tbl = _table()
    if tbl is None:
        return C.ok()
    try:
        for s in tbl.search(plan=r, revoked=False):
            s["revoked"] = True
    except Exception:
        return C.fail(SETUP)
    return C.ok()


def drop_for_plan(plan_row):
    """Delete a plan's links (called before the plan itself is deleted)."""
    tbl = _table()
    if tbl is None:
        return
    try:
        for s in tbl.search(plan=plan_row):
            s.delete()
    except Exception:
        pass


@anvil.server.callable
def get_shared_plan(token):
    """Public: the read-only plan behind a link. No email, no row ids, notes only when the owner allowed them."""
    if not isinstance(token, str) or not TOKEN.match(token):
        return C.fail("This link doesn't exist. Ask the person who shared it for a new one.")
    tbl = _table()
    if tbl is None:
        return dict(C.fail(SETUP), setup=True)
    try:
        s = tbl.get(token=token)
    except Exception:
        return dict(C.fail(SETUP), setup=True)
    if s is None:
        return C.fail("This link doesn't exist. Ask the person who shared it for a new one.")
    if s["revoked"]:
        return dict(C.fail("This link was turned off by the person who shared it."), revoked=True)
    p = s["plan"]
    if p is None:
        return dict(C.fail("This plan was deleted."), revoked=True)
    seen = anvil.server.session.get("shares_seen") or []
    if token not in seen:  # one view per visitor session
        getattr(anvil.server, "session")["shares_seen"] = (seen + [token])[-50:]
        s["views"] = int(s["views"] or 0) + 1
        s["last_viewed"] = C.now()
    plan = {"guide": p["guide"], "title": p["title"], "area": p["area"] or "", "target_date": C.iso(p["target_date"]),
            "done": list(p["done"] or []), "hiring": bool(p["hiring"]), "updated": C.iso(p["updated"]),
            "notes": dict(p["notes"] or {}) if s["show_notes"] else {}}
    return C.ok(plan=plan, owner=first_name(s["owner"]), show_notes=bool(s["show_notes"]))
