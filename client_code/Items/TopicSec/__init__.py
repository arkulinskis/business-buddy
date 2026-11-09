from anvil import *

from ._anvil_designer import TopicSecTemplate


class TopicSec(TopicSecTemplate):
    """Topic: one section of the basics or of "going deeper". item = [heading, html]."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["head"].textContent = self.item[0]
        self.prose.content = self.item[1]
