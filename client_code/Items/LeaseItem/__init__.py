from anvil import *

from ._anvil_designer import LeaseItemTemplate
from ... import router

LEVELS = {"red": "Stop", "amber": "Check", "green": "OK"}


class LeaseItem(LeaseItemTemplate):
    """Before you sign the lease: one point of the result (ask the borough, put in the lease, or a permit in order).
    item = {level: red|amber|green, title, text, url, topic} from lease_rules.evaluate. The level is a coloured dot plus
    a word (Stop / Check / OK), so it reads without colour and on a black-and-white printout."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        n = self.dom_nodes
        n["row"].classList.add("ls-" + it["level"])
        n["title"].textContent = it["title"]
        n["level"].textContent = LEVELS.get(it["level"], "")
        n["text"].textContent = it["text"]
        if it.get("topic"):
            n["topic"].setAttribute("href", router.href("topic", it["topic"]))
        else:
            n["topic"].remove()
        if it.get("url"):
            n["url"].setAttribute("href", it["url"])
        else:
            n["url"].remove()
