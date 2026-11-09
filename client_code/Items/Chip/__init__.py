from anvil import *

from ._anvil_designer import ChipTemplate


class Chip(ChipTemplate):
    """A round filter button (library categories and filters, tools answers). item = {key, label, icon, on, group};
    a click raises x-chip on the panel with key and group."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        n = self.dom_nodes
        n["label"].textContent = it["label"]
        if it.get("icon"):
            n["icon"].classList.add("ic-" + it["icon"])
        else:
            n["icon"].remove()
        n["btn"].classList.toggle("on", bool(it.get("on")))
        n["btn"].setAttribute("aria-pressed", "true" if it.get("on") else "false")
        n["btn"].setAttribute("data-key", "%s:%s" % (it.get("group") or "", it["key"]))

    def btn_click(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-chip", key=self.item["key"], group=self.item.get("group"))
