from anvil import *

from ._anvil_designer import GuideGroupTemplate


class GuideGroup(GuideGroupTemplate):
    """Library: guide cards, under a category heading when sorted A to Z. item = {cat (or None), guides}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item.get("cat")
        if c:
            self.dom_nodes["icon"].classList.add("ic-" + c["icon"])
            self.dom_nodes["name"].textContent = c["name"]
        else:
            self.dom_nodes["head"].remove()
        self.guides_panel.items = self.item["guides"]
