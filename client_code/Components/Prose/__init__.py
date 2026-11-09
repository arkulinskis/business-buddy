from anvil import *

from ._anvil_designer import ProseTemplate


class Prose(ProseTemplate):
    """Knowledge-base prose (static HTML from theme/assets/bb.js, written by us; never people's input).
    The property is `content`, not `html`: templated Forms use `html` themselves."""

    def __init__(self, **properties):
        self._content, self._ready = "", False
        super().__init__(**properties)
        self._ready = True
        self._draw()

    @property
    def content(self):
        return self._content

    @content.setter
    def content(self, value):
        self._content = value or ""
        self._draw()

    def _draw(self):
        if self._ready:
            self.dom_nodes["box"].innerHTML = self._content
