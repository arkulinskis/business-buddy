from anvil import *
from anvil.js import window

from ._anvil_designer import StageStepTemplate
from ... import state


class StageStep(StageStepTemplate):
    """Basics hero: a stage of the roadmap; a click scrolls to it. item = {n, stage, count}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        n = self.dom_nodes
        n["num"].textContent = str(self.item["n"])
        n["name"].textContent = self.item["stage"]["name"]
        n["count"].textContent = state.plural(self.item["count"], "topic")

    def link_click(self, event):
        event.preventDefault()
        el = window.document.getElementById("bs-" + self.item["stage"]["id"])
        if el:
            el.scrollIntoView({"behavior": "smooth"})
