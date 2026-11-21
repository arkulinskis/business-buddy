import anvil.server
from anvil import *

from ._anvil_designer import SharePlanTemplate
from ... import state


class SharePlan(SharePlanTemplate):
    """Plan -> "Share with an advisor": make a read-only link (#shared/<token>), copy it, include notes or not
    (off by default), see how often it was opened, stop sharing. Server: get_share, create_share, set_share_notes,
    revoke_share (all owner-only). Expected problems (table being set up, rate limit) show inside the dialog."""

    def __init__(self, plan_id, title="", **properties):
        super().__init__(**properties)
        self.plan_id, self.title = plan_id, title
        state.set_control_attr(self.link_box, "readonly", "readonly")
        state.set_control_attr(self.link_box, "aria-label", "Share link")
        self.share = None
        r = anvil.server.call("get_share", plan_id)
        if not r.get("ok"):
            self._say(r.get("error"))
        else:
            self.share = r.get("share")
        self.draw()

    def _say(self, text):
        self.message.text, self.message.visible = text or "", bool(text)

    def url(self):
        return "%s/#shared/%s" % (state.SITE, self.share["token"]) if self.share else ""

    def draw(self):
        on = bool(self.share)
        self.off_part.visible = not on
        self.on_part.visible = on
        if on:
            s = self.share
            self.link_box.text = self.url()
            self.notes_box.checked = bool(s.get("show_notes"))
            n = int(s.get("views") or 0)
            seen = (", last " + state.ago(s["last_viewed"])) if s.get("last_viewed") else ""
            self.dom_nodes["views"].textContent = ("Not opened yet" if n == 0 else "Opened " + state.plural(n, "time") + seen)

    @handle("create_button", "click")
    def create_button_click(self, **event_args):
        self.create_button.enabled = False
        try:
            r = anvil.server.call("create_share", self.plan_id, bool(self.notes_new.checked))
        finally:
            self.create_button.enabled = True
        if not r.get("ok"):
            self._say(r.get("error"))
            return
        self._say("")
        self.share = r["share"]
        self.draw()
        state.focus(self.copy_button)

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        state.copy_text(self.url())

    @handle("notes_box", "change")
    def notes_box_change(self, **event_args):
        r = anvil.server.call("set_share_notes", self.plan_id, bool(self.notes_box.checked))
        if not r.get("ok"):
            self._say(r.get("error"))
            self.notes_box.checked = not self.notes_box.checked
            return
        self._say("")
        self.share = r["share"]
        state.toast("Your notes are included" if self.share["show_notes"] else "Your notes are hidden", "ok")

    @handle("stop_button", "click")
    def stop_button_click(self, **event_args):
        r = anvil.server.call("revoke_share", self.plan_id)
        if not r.get("ok"):
            self._say(r.get("error"))
            return
        self.share = None
        self._say("")
        self.draw()
        state.toast("Sharing stopped: the old link no longer works.", "ok")

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("done_button", "click")
    def done_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
