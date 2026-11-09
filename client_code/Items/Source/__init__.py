from anvil import *

from ._anvil_designer import SourceTemplate


class Source(SourceTemplate):
    """An official source link. item = [label, url]."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["link"].setAttribute("href", self.item[1])
        self.dom_nodes["label"].textContent = self.item[0]
