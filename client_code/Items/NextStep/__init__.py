from anvil import *

from ._anvil_designer import NextStepTemplate


class NextStep(NextStepTemplate):
    """Home: one of a plan's next steps. item = {t, phase, href}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        n = self.dom_nodes
        n["link"].setAttribute("href", self.item["href"])
        n["t"].textContent = self.item["t"]
        n["phase"].textContent = "· " + self.item["phase"]
