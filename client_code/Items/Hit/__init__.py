from anvil import *

from ._anvil_designer import HitTemplate
from ... import router


class Hit(HitTemplate):
    """One search result in the library: a guide, a Basics topic or a glossary term. item = a bb.search() hit."""

    def __init__(self, **properties):
        super().__init__(**properties)
        h = self.item
        n = self.dom_nodes
        kind = h["kind"]
        if kind == "guide":
            n["link"].setAttribute("href", router.href("guide", h["slug"]))
            n["link"].classList.add("bb-cat-" + (h.get("cat") or ""))
            n["badge"].textContent = "Guide"
            n["name"].textContent = h["name"]
        elif kind == "topic":
            n["link"].setAttribute("href", router.href("topic", h["slug"]))
            n["tile"].classList.add("teal")
            n["badge"].textContent = "Basics"
            n["badge"].classList.add("accent")
            n["name"].textContent = h["name"]
        else:
            n["link"].setAttribute("href", "#glossary")
            n["badge"].textContent = "Glossary"
            n["name"].textContent = h["name"] + " · " + h.get("en", "")
        n["icon"].classList.add("ic-" + (h.get("icon") or "book"))
        n["tagline"].textContent = h["tagline"]
