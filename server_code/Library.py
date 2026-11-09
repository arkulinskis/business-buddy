"""The knowledge base's server side: page views, "was this helpful?" votes and bookmarks.

The guides and topics themselves are static content in the browser (web/pages/_kb_*.html), so a page
is identified by (kind, slug): kind "guide" (a business, e.g. barber-shop) or "topic" (e.g. gst-qst).
Reading is open to everyone; bookmarking needs an account.
"""
import re

import anvil.server
from anvil.tables import app_tables

from . import common as C
from . import DemoData

KINDS = ("guide", "topic")
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,48}$")


def valid(kind, slug):
    return kind in KINDS and isinstance(slug, str) and bool(SLUG.match(slug))


def views_of(kind, slug):
    return int(sum((r["views"] or 0) for r in app_tables.page_stats.search(kind=kind, slug=slug)))


def votes_of(kind, slug):
    rows = app_tables.votes.search(kind=kind, slug=slug)
    up = len([r for r in rows if r["helpful"]])
    return up, len(rows)


def _bump_view(kind, slug):
    """One view per page per browser session, so refreshing doesn't inflate the count."""
    key = kind + ":" + slug
    seen = list(anvil.server.session.get("seen") or [])
    if key in seen:
        return
    getattr(anvil.server, "session")["seen"] = (seen + [key])[-300:]
    row = app_tables.page_stats.get(kind=kind, slug=slug, is_demo=False)
    if row is None:
        app_tables.page_stats.add_row(kind=kind, slug=slug, views=1, is_demo=False)
    else:
        row["views"] = (row["views"] or 0) + 1


def _my_vote_row(kind, slug, me):
    if me is not None:
        return app_tables.votes.get(user=me, kind=kind, slug=slug)
    vid = (anvil.server.session.get("votes") or {}).get(kind + ":" + slug)
    return C.row_by_id(app_tables.votes, vid) if vid else None


@anvil.server.callable
def page_state(kind, slug):
    """Called when a guide or topic opens: counts the view, returns its votes and, for members, whether it is
    saved and which of their plans uses it."""
    if not valid(kind, slug):
        return C.fail("That page doesn't exist.")
    DemoData.ensure_loaded()
    me = C.me()
    _bump_view(kind, slug)
    up, total = votes_of(kind, slug)
    mine = _my_vote_row(kind, slug, me)
    out = {"views": views_of(kind, slug), "helpful": up, "votes": total,
           "my_vote": None if mine is None else bool(mine["helpful"]), "saved": False, "plan": None}
    if me is not None:
        out["saved"] = app_tables.saved.get(owner=me, kind=kind, slug=slug) is not None
        if kind == "guide":
            plan = next(iter(app_tables.plans.search(owner=me, guide=slug)), None)
            if plan is not None:
                out["plan"] = {"id": plan.get_id(), "title": plan["title"]}
    return C.ok(**out)


@anvil.server.callable
def vote(kind, slug, helpful):
    """Anyone can say whether a page helped; one vote per person (or per browser session), changeable."""
    if not valid(kind, slug):
        return C.fail("That page doesn't exist.")
    me = C.me()
    row = _my_vote_row(kind, slug, me)
    if row is None and C.rate_limited("vote", 40, 3600):
        return C.fail("Thanks! That's plenty of votes for one hour.")
    if row is None:
        row = app_tables.votes.add_row(user=me, kind=kind, slug=slug, helpful=bool(helpful), created=C.now(), is_demo=False)
        if me is None:
            votes = dict(anvil.server.session.get("votes") or {})
            votes[kind + ":" + slug] = row.get_id()
            getattr(anvil.server, "session")["votes"] = votes
    else:
        row.update(helpful=bool(helpful), created=C.now())
    up, total = votes_of(kind, slug)
    return C.ok(helpful=up, votes=total, my_vote=bool(helpful))


@anvil.server.callable(require_user=True)
def toggle_save(kind, slug, on=None):
    me = C.require_user()
    if not valid(kind, slug):
        return C.fail("That page doesn't exist.")
    row = app_tables.saved.get(owner=me, kind=kind, slug=slug)
    want = (row is None) if on is None else bool(on)
    if want and row is None:
        if len(app_tables.saved.search(owner=me)) >= 200:
            return C.fail("You have 200 saved pages. Remove a few first.")
        app_tables.saved.add_row(owner=me, kind=kind, slug=slug, created=C.now(), is_demo=False)
    elif not want and row is not None:
        row.delete()
    return C.ok(saved=want)


def saved_list(me):
    rows = sorted(app_tables.saved.search(owner=me), key=lambda r: r["created"], reverse=True)
    return [{"kind": r["kind"], "slug": r["slug"], "saved": C.iso(r["created"])} for r in rows]


def popular(limit=6):
    """The most-viewed guides (counts include the demo rows)."""
    totals = {}
    for r in app_tables.page_stats.search(kind="guide"):
        totals[r["slug"]] = totals.get(r["slug"], 0) + (r["views"] or 0)
    return [{"slug": s, "views": int(v)} for s, v in sorted(totals.items(), key=lambda kv: -kv[1])[:limit]]


@anvil.server.callable
def get_popular():
    DemoData.ensure_loaded()
    return {"guides": popular(8)}
