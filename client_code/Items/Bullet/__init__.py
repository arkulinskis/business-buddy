from anvil import *

from ._anvil_designer import BulletTemplate


class Bullet(BulletTemplate):
    """Guide: a tip, an advanced trick or a pitfall. item = {text, icon}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["icon"].classList.add("ic-" + self.item["icon"])
        self.dom_nodes["text"].textContent = self.item["text"]
