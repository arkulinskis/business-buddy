from anvil import *

from ._anvil_designer import StreetTemplate
from ... import bb


class Street(StreetTemplate):
    """The storefront drawing. The SVG comes from the engine (bb.street()); colours come from app.css (.bb-street)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["box"].innerHTML = bb.street()
