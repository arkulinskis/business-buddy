from anvil import *

from ._anvil_designer import TopicCardTemplate
from ... import router


class TopicCard(TopicCardTemplate):
    """A Basics topic as a card (basics, guide, topic). item = a topic summary from bb.DATA."""

    def __init__(self, **properties):
        super().__init__(**properties)
        t = self.item
        n = self.dom_nodes
        n["link"].setAttribute("href", router.href("topic", t["slug"]))
        n["icon"].classList.add("ic-" + t["icon"])
        n["name"].textContent = t["title"]
        n["fr"].textContent = t["fr"]
        n["summary"].textContent = t["summary"]
        n["minutes"].textContent = "%d min read" % t["minutes"]
