from anvil import *

from ._anvil_designer import VoteBoxTemplate
from ... import state


class VoteBox(VoteBoxTemplate):
    """Helpful votes for one guide or topic (server: vote). Report outdated info = the Prepsto feedback panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.kind, self.slug = "", ""
        self.st: dict = {}
        self._draw()

    def setup(self, kind, slug, st):
        self.kind, self.slug = kind, slug
        self.st = dict(st or {})
        self._draw()

    def _draw(self):
        st = self.st
        v = st.get("my_vote")
        for btn, on in ((self.yes_button, v is True), (self.no_button, v is False)):
            btn.role = ["btn", "btn-sm", "on", "ic-thumb" if btn is self.yes_button else "ic-thumbdown"] if on else \
                ["btn", "btn-sm", "ic-thumb" if btn is self.yes_button else "ic-thumbdown"]
            state.set_control_attr(btn, "aria-pressed", "true" if on else "false")
        text = "%d of %d found it helpful" % (st.get("helpful") or 0, st["votes"]) if st.get("votes") else "Be the first to say"
        if st.get("views"):
            text += " · " + state.plural(st["views"], "view")
        self.counts.text = text

    def _vote(self, helpful):
        if not self.slug:
            return
        r = state.call("vote", self.kind, self.slug, helpful)
        if r:
            self.st.update({"helpful": r.get("helpful"), "votes": r.get("votes"), "my_vote": r.get("my_vote")})
            self._draw()
            state.toast("Thanks for the feedback!", "ok")

    @handle("yes_button", "click")
    def yes_button_click(self, **event_args):
        self._vote(True)

    @handle("no_button", "click")
    def no_button_click(self, **event_args):
        self._vote(False)

    @handle("report_button", "click")
    def report_button_click(self, **event_args):
        state.feedback()
