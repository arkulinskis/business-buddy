from anvil import *

from ._anvil_designer import CostRowTemplate
from ... import bb


class CostRow(CostRowTemplate):
    """Guide: one line of a cost table. item = {label, low, high, total}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        n = self.dom_nodes
        n["label"].textContent = it["label"]
        n["low"].textContent = bb.money(it["low"])
        n["high"].textContent = bb.money(it["high"])
        if it.get("total"):
            n["row"].classList.add("total")
