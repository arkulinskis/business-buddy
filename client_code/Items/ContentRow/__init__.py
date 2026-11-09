from anvil import *

from ._anvil_designer import ContentRowTemplate
from ... import router


class ContentRow(ContentRowTemplate):
    """Admin, Content tab: one guide or topic with its views, helpful votes and plans. item = a row the page built."""

    def __init__(self, **properties):
        super().__init__(**properties)
        r = self.item
        n = self.dom_nodes
        n["link"].setAttribute("href", router.href(r["kind"], r["slug"]))
        n["title"].textContent = r["title"]
        n["kind"].textContent = "Guide" if r["kind"] == "guide" else "Basics"
        n["views"].textContent = str(r["views"])
        pct = r.get("pct")
        if pct is None:
            n["helpful"].textContent = "–"
        else:
            n["helpful"].textContent = "%d%% of %d" % (pct, r["up"] + r["down"])
            n["helpful"].classList.add("good" if pct >= 70 else "warn" if pct >= 40 else "bad")
        n["plans"].textContent = str(r["plans"]) if r["kind"] == "guide" else "–"
