from anvil import *

from ._anvil_designer import StageBlockTemplate


class StageBlock(StageBlockTemplate):
    """Basics: one stage of the roadmap with its topics. item = {n, stage, topics}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        n = self.dom_nodes
        n["sec"].setAttribute("id", "bs-" + self.item["stage"]["id"])
        n["num"].textContent = str(self.item["n"])
        n["name"].textContent = self.item["stage"]["name"]
        self.topics_panel.items = self.item["topics"]
