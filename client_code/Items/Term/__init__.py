from anvil import *

from ._anvil_designer import TermTemplate


class Term(TermTemplate):
    """A glossary entry. item = {w: [french, english, meaning], letter: "A" or ""} (letter = start of a new letter)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        w = self.item["w"]
        n = self.dom_nodes
        n["fr"].textContent = w[0]
        n["en"].textContent = "· " + w[1]
        n["meaning"].textContent = w[2]
        if self.item.get("letter"):
            n["letter"].textContent = self.item["letter"]
        else:
            n["letter"].remove()
