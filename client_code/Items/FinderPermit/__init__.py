from anvil import *

from ._anvil_designer import FinderPermitTemplate
from ... import router


class FinderPermit(FinderPermitTemplate):
    """Permit finder: one permit on your list. item = {p (permit), why}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item["p"]
        n = self.dom_nodes
        n["name"].textContent = p["name"]
        n["who"].textContent = p["who"] + " · " + p["cost"]
        n["why"].textContent = self.item["why"]
        if p.get("topic"):
            n["topic"].setAttribute("href", router.href("topic", p["topic"]))
        else:
            n["topic"].remove()
        if p.get("url"):
            n["url"].setAttribute("href", p["url"])
        else:
            n["url"].remove()
