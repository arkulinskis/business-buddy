from anvil import *

from ._anvil_designer import PlanPhaseTemplate


class PlanPhase(PlanPhaseTemplate):
    """Plan checklist: one phase (open/closed, its count) with its tasks. item = {ph, n, host}; the page (host)
    keeps the plan, saves ticks and notes, and remembers which phases are closed."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.ph = self.item["ph"]
        self.host = self.item["host"]
        self.dom_nodes["num"].textContent = "Phase %d" % self.item["n"]
        self.dom_nodes["name"].textContent = self.ph["name"]
        self.dom_nodes["tasks_box"].setAttribute("id", "pl-tasks-" + self.ph["id"])
        self.dom_nodes["head"].setAttribute("aria-controls", "pl-tasks-" + self.ph["id"])
        self.tasks_panel.items = [{"t": t, "host": self.host, "phase": self} for t in self.ph["tasks"]]
        self.draw()

    def counts(self):
        done = self.host.done_ids()
        n = len([t for t in self.ph["tasks"] if t["id"] in done])
        return n, len(self.ph["tasks"])

    def draw(self):
        n, total = self.counts()
        all_done = n == total
        closed = self.host.is_closed(self.ph["id"], all_done)
        nodes = self.dom_nodes
        nodes["count"].textContent = "%d / %d" % (n, total)
        nodes["sec"].classList.toggle("done", all_done)
        nodes["sec"].classList.toggle("closed", closed)
        nodes["head"].setAttribute("aria-expanded", "false" if closed else "true")
        icon = nodes["icon"]
        icon.className = "ic ic-" + ("check" if all_done else self.ph["icon"])

    def head_click(self, event):
        closed = not self.dom_nodes["sec"].classList.contains("closed")
        self.host.set_closed(self.ph["id"], closed)
        self.draw()
