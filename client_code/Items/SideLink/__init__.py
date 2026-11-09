from anvil import *

from ._anvil_designer import SideLinkTemplate


class SideLink(SideLinkTemplate):
    """Home: a saved page or a popular guide. item = {href, icon, tile (css class), label, extra}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        n = self.dom_nodes
        n["link"].setAttribute("href", it["href"])
        n["icon"].classList.add("ic-" + it["icon"])
        if it.get("tile"):
            n["tile"].classList.add(it["tile"])
        n["label"].textContent = it["label"]
        n["extra"].textContent = it.get("extra") or ""
