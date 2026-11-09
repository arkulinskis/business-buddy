from anvil import *

from ._anvil_designer import SaveButtonTemplate
from ... import state


class SaveButton(SaveButtonTemplate):
    """Bookmark a guide or topic (it then shows on #home under Saved)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.kind, self.slug, self.saved = "", "", False
        me = state.me()
        self.guest_link.visible = not me
        self.save_button.visible = bool(me)
        self._draw()

    def setup(self, kind, slug, st):
        self.kind, self.slug = kind, slug
        self.saved = bool(st and st.get("saved"))
        self._draw()

    def _draw(self):
        on = self.saved
        self.save_button.text = "Saved" if on else "Save"
        self.save_button.role = ["btn", "btn-accent", "ic-bookmarked"] if on else ["btn", "ic-bookmark"]
        state.set_control_attr(self.save_button, "aria-pressed", "true" if on else "false")

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        if not self.slug:
            return
        r = state.call("toggle_save", self.kind, self.slug)
        if r:
            self.saved = bool(r.get("saved"))
            self._draw()
            state.toast("Saved to your dashboard" if self.saved else "Removed from saved", "ok")
