from anvil import *

from ._anvil_designer import PermitTemplate
from ... import router


class Permit(PermitTemplate):
    """Guide: one permit or registration card. item = a permit from bb.DATA["permits"]."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item
        n = self.dom_nodes
        for k in ("name", "fr", "who", "cost", "when"):
            n[k].textContent = p.get(k) or ""
        if p.get("topic"):
            n["topic"].setAttribute("href", router.href("topic", p["topic"]))
        else:
            n["topic"].remove()
        if p.get("url"):
            n["url"].setAttribute("href", p["url"])
        else:
            n["url"].remove()
