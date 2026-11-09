from anvil import *

from ._anvil_designer import QuestionTemplate
from ... import state


class Question(QuestionTemplate):
    """Tools: one question with its answers as chips (permit finder, structure quiz). item = {key, label, multi,
    opts: [[value, label, icon?]], host}; the host keeps the answers (host.answer(key, value) / host.answers)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["label"].textContent = self.item["label"]
        self.dom_nodes["box"].setAttribute("aria-label", self.item["label"])
        self.opts_panel.add_event_handler("x-chip", self._pick)
        self.draw()

    def draw(self):
        it = self.item
        cur = it["host"].answers.get(it["key"])
        on = (lambda v: v in (cur or [])) if it.get("multi") else (lambda v: v == cur)
        self.opts_panel.items = [{"key": o[0], "label": o[1], "icon": o[2] if len(o) > 2 else None, "on": on(o[0]),
                                  "group": it["key"]} for o in it["opts"]]

    def _pick(self, key, group, **event_args):
        self.item["host"].answer(self.item["key"], key)
        self.draw()
        state.refocus(self.opts_panel, "%s:%s" % (group or "", key))
