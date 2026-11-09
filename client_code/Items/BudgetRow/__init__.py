from anvil import *

from ._anvil_designer import BudgetRowTemplate
from ... import bb, state


class BudgetRow(BudgetRowTemplate):
    """Plan budget: one cost line. item = {row: {label, amount, kind}, host}. Edits go straight into row (the page
    reads the rows when saving) and tell the host to redraw the totals."""

    def __init__(self, **properties):
        super().__init__(**properties)
        r = self.item["row"]
        self.host = self.item["host"]
        self.label_box.text = r.get("label") or ""
        state.set_control_attr(self.label_box, "maxlength", "80")
        self.amount_box.text = bb.fmt_num(r["amount"]) if r.get("amount") not in (None, "") else ""
        self.kind_box.items = [("One-time", "once"), ("Monthly", "monthly")]
        self.kind_box.selected_value = "monthly" if r.get("kind") == "monthly" else "once"
        state.set_control_attr(self.label_box, "aria-label", "Item")
        state.set_control_attr(self.amount_box, "aria-label", "Amount")
        state.set_control_attr(self.amount_box, "inputmode", "decimal")
        state.set_control_attr(self.amount_box, "min", "0")
        state.set_control_attr(self.kind_box, "aria-label", "Type")
        state.set_control_attr(self.del_button, "aria-label", "Remove line")

    def _changed(self):
        r = self.item["row"]
        r["label"] = self.label_box.text or ""
        r["amount"] = bb.number(self.amount_box.text)
        r["kind"] = self.kind_box.selected_value or "once"
        self.host.budget_changed()

    @handle("label_box", "change")
    def label_box_change(self, **event_args):
        self._changed()

    @handle("amount_box", "change")
    def amount_box_change(self, **event_args):
        self._changed()

    @handle("kind_box", "change")
    def kind_box_change(self, **event_args):
        self._changed()

    @handle("del_button", "click")
    def del_button_click(self, **event_args):
        self.host.remove_row(self.item["row"])
