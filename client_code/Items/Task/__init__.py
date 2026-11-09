from anvil import *
from anvil.js import window

from ._anvil_designer import TaskTemplate
from ... import bb, router, state


class Task(TaskTemplate):
    """Plan checklist: one task (tick, description, the Basics topic it relates to, a private note).
    item = {t (task from bb.phases), host (the Plan page), phase (its PlanPhase)}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        t = self.item["t"]
        self.host = self.item["host"]
        n = self.dom_nodes
        n["title"].textContent = t["t"]
        if t.get("special") and self.host.guide_name():
            badge = window.document.createElement("span")
            badge.className = "ui-badge brand"
            badge.textContent = self.host.guide_name()
            n["title"].appendChild(badge)
        n["desc"].textContent = t.get("d") or ""
        topic = bb.topic_info(t.get("topic"))
        if topic:
            n["topic"].setAttribute("href", router.href("topic", topic["slug"]))
            n["topic_name"].textContent = topic["title"]
        else:
            n["topic"].remove()
        state.set_control_attr(self.check, "aria-label", t["t"])
        state.set_control_attr(self.note_box, "maxlength", "1500")
        self.editing = False
        self.draw()

    def draw(self):
        t = self.item["t"]
        on = t["id"] in self.host.done_ids()
        note = self.host.note(t["id"])
        self.check.checked = on
        self.dom_nodes["row"].classList.toggle("is-done", on)
        self.note_link.text = "Edit note" if note else "Add a note"
        self.note_view.text = note
        self.note_view.visible = bool(note) and not self.editing
        self.note_editor.visible = self.editing

    def _toggle(self, on):
        self.check.checked = on
        self.dom_nodes["row"].classList.toggle("is-done", on)
        self.host.tick(self.item["t"]["id"], on, self.item["phase"], self)

    @handle("check", "change")
    def check_change(self, **event_args):
        self._toggle(self.check.checked)

    def title_click(self, event):
        self._toggle(not self.check.checked)

    @handle("note_link", "click")
    def note_link_click(self, **event_args):
        self.editing = True
        self.note_box.text = self.host.note(self.item["t"]["id"])
        self.draw()
        self.note_box.focus()

    @handle("note_cancel", "click")
    def note_cancel_click(self, **event_args):
        self.editing = False
        self.draw()

    @handle("note_save", "click")
    def note_save_click(self, **event_args):
        if self.host.save_note(self.item["t"]["id"], self.note_box.text or ""):
            self.editing = False
            self.draw()
