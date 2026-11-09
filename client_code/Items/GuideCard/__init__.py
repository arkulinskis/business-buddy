from anvil import *

from ._anvil_designer import GuideCardTemplate
from ... import bb, router


class GuideCard(GuideCardTemplate):
    """A business guide as a card (library, landing). item = a guide summary from bb.DATA (+ "popular": True)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        g = self.item
        n = self.dom_nodes
        n["link"].setAttribute("href", router.href("guide", g["slug"]))
        n["link"].classList.add("bb-cat-" + g["cat"])
        n["icon"].classList.add("ic-" + g["icon"])
        n["name"].textContent = g["name"]
        n["fr"].textContent = g["fr"]
        n["tagline"].textContent = g["tagline"]
        n["cost"].textContent = bb.cost_range(g["glance"]["cost"])
        n["weeks"].textContent = bb.weeks(g["glance"]["weeks"])
        if not g["glance"].get("home"):
            n["home"].remove()
        if not g.get("popular"):
            n["popular"].remove()
