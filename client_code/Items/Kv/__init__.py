from anvil import *

from ._anvil_designer import KvTemplate


class Kv(KvTemplate):
    """Tools: one result line. item = [label, value]."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["k"].textContent = self.item[0]
        self.dom_nodes["v"].textContent = self.item[1]
