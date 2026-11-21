from anvil import *
from anvil.js import window

from ._anvil_designer import SharedTemplate
from ... import bb, router, state


class Shared(SharedTemplate):
    """#shared/<token> (anyone): a launch plan someone shared with an advisor, read-only. The checklist reuses
    Items/PlanPhase + Items/Task with this page as a readonly host (ticks disabled, no note editing); notes show only
    when the owner allowed them. Server: get_shared_plan (public; first name only, never an email).
    Errors: unknown link, turned off ("Stop sharing"), plan deleted, table not set up yet."""

    readonly = True

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.plan: dict = {}
        self.closed: dict = {}
        self.g = None
        token = args[0] if args else ""
        r = state.call_quiet("get_shared_plan", token) if token else None
        if not isinstance(r, dict) or not r.get("ok"):
            self._error(r)
            return
        self.error_part.visible = False
        self.plan = r["plan"]
        self.g = bb.guide_info(self.plan["guide"])
        self.draw(r.get("owner") or "", bool(r.get("show_notes")))

    def _error(self, r):
        self.plan_part.visible = False
        n = self.dom_nodes
        if r is None:
            n["err_title"].textContent = "This link doesn't work"
            n["err_text"].textContent = "We couldn't open it. Check your connection, or ask the person who shared it for a new link."
        elif r.get("setup"):
            n["err_title"].textContent = "Almost ready"
            n["err_text"].textContent = r.get("error") or ""
        elif r.get("revoked"):
            n["err_title"].textContent = "This link was turned off"
            n["err_text"].textContent = (r.get("error") or "") + " Ask them for a new one if you still need it."
        else:
            n["err_title"].textContent = "This link doesn't exist"
            n["err_text"].textContent = r.get("error") or ""

    def draw(self, owner, show_notes):
        p = self.plan
        n = self.dom_nodes
        who = owner or "The founder"
        n["banner"].textContent = ("%s shared this launch plan with you. It's read-only: only %s can change it.%s" % (
            who, owner or "they", " Their notes are included." if show_notes else ""))
        n["title"].textContent = p["title"]
        window.document.title = p["title"] + " (shared plan) · Business Buddy"
        if self.g:
            n["guide_name"].textContent = self.g["name"] + " launch plan"
            n["guide_link"].setAttribute("href", router.href("guide", self.g["slug"]))
            n["own_link"].setAttribute("href", router.href("plan", "new", self.g["slug"]))
        else:
            n["guide_name"].textContent = "Launch plan"
            n["guide_link"].style.display = "none"
            n["own_link"].setAttribute("href", "#library")
        n["area_badge"].style.display = "" if p.get("area") else "none"
        n["area"].textContent = p.get("area") or ""
        days = bb.days_until(p.get("target_date"))
        if days is None:
            n["date_badge"].style.display = "none"
        else:
            n["date_badge"].classList.add("good" if days < 0 else "warn" if days < 30 else "brand")
            n["date"].textContent = ("Opening in " + state.plural(days, "day")) if days >= 0 else ("Opened " + state.plural(-days, "day") + " ago")
        n["hiring_badge"].style.display = "" if p.get("hiring") else "none"
        n["updated"].textContent = ("Last updated " + state.ago(p["updated"])) if p.get("updated") else ""
        pr = bb.progress(p)
        n["ring"].style.setProperty("--p", str(pr["pct"]))
        n["ring"].setAttribute("aria-label", "%d%% done" % pr["pct"])
        n["pct"].textContent = "%d%%" % pr["pct"]
        n["count"].textContent = "%d / %d steps" % (pr["done"], pr["total"])
        self.phases_panel.items = [{"ph": ph, "n": i + 1, "host": self} for i, ph in enumerate(bb.phases(p["guide"], p.get("hiring")))]

    # ---- the readonly host Items/PlanPhase and Items/Task read from
    def done_ids(self):
        return self.plan.get("done") or []

    def note(self, task_id):
        return (self.plan.get("notes") or {}).get(task_id) or ""

    def guide_name(self):
        return self.g["name"] if self.g else ""

    def is_closed(self, phase_id, all_done):
        return bool(self.closed.get(phase_id))  # every phase starts open for the advisor; closing one is only for this visit

    def set_closed(self, phase_id, closed):
        self.closed[phase_id] = closed

    def tick(self, task_id, on, phase, task):
        pass

    def save_note(self, task_id, text):
        return False
