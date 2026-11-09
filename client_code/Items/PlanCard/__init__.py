from anvil import *

from ._anvil_designer import PlanCardTemplate
from ... import bb, router, state


class PlanCard(PlanCardTemplate):
    """Home: one launch plan with its progress ring, opening countdown and the next three steps. item = a plan."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item
        g = bb.guide_info(p["guide"])
        pr = bb.progress(p)
        days = bb.days_until(p.get("target_date"))
        href = router.href("plan", p["id"])
        n = self.dom_nodes
        n["ring"].style.setProperty("--p", str(pr["pct"]))
        n["ring"].setAttribute("aria-label", "%d%% done" % pr["pct"])
        n["pct"].textContent = "%d%%" % pr["pct"]
        n["title"].textContent = p["title"]
        n["meta"].textContent = (g["name"] if g else p["guide"]) + (" · " + p["area"] if p.get("area") else "")
        if days is None:
            n["cal"].remove()
            n["date"].textContent = "No opening date yet"
            n["date"].classList.add("muted")
        elif days >= 0:
            n["date"].textContent = "Opening in " + state.plural(days, "day")
        else:
            n["date"].textContent = "Opened " + state.plural(-days, "day") + " ago"
        n["open"].setAttribute("href", href)
        n["open"].setAttribute("aria-label", "Open " + p["title"])
        n["bar"].style.width = "%d%%" % pr["pct"]
        count = "%d of %d steps done" % (pr["done"], pr["total"])
        if p.get("cost_once"):
            count += " · budget %s + %s/month" % (bb.money(p["cost_once"]), bb.money(p.get("cost_monthly") or 0))
        n["count"].textContent = count
        nxt = bb.next_tasks(p, 3)
        if nxt:
            self.next_panel.items = [{"t": x["t"], "phase": x["phase"], "href": href} for x in nxt]
            n["all_done"].remove()
        else:
            n["next_box"].remove()
