from anvil import *

from ._anvil_designer import GlossPickTemplate


class GlossPick(GlossPickTemplate):
    """Basics: a glossary word worth knowing. item = [french, english, meaning]."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["fr"].textContent = self.item[0]
        self.dom_nodes["en"].textContent = self.item[1]
