from anvil import *

from ._anvil_designer import CatTileTemplate
from ... import router, state


class CatTile(CatTileTemplate):
    """Landing: one business category. item = a category from bb.DATA + n (its number of guides)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        n = self.dom_nodes
        n["link"].setAttribute("href", router.href("library", c["id"]))
        n["link"].classList.add("bb-cat-" + c["id"])
        n["icon"].classList.add("ic-" + c["icon"])
        n["name"].textContent = c["name"]
        n["count"].textContent = state.plural(c["n"], "guide")
