from anvil import *

from ._anvil_designer import LinkChipTemplate


class LinkChip(LinkChipTemplate):
    """A round link (topic page: the businesses where it matters). item = {href, label, icon}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        n = self.dom_nodes
        n["link"].setAttribute("href", self.item["href"])
        n["icon"].classList.add("ic-" + self.item["icon"])
        n["label"].textContent = self.item["label"]
