from anvil import *

from ._anvil_designer import PhaseTemplate
from ... import state


class Phase(PhaseTemplate):
    """Guide: one phase of the launch roadmap preview. item = {n, ph} (ph from bb.phases)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        ph = self.item["ph"]
        tasks = ph["tasks"]
        n = self.dom_nodes
        n["num"].textContent = str(self.item["n"])
        n["name"].textContent = ph["name"]
        n["count"].textContent = "· " + state.plural(len(tasks), "step")
        n["preview"].textContent = " · ".join(t["t"] for t in tasks[:3]) + (" · …" if len(tasks) > 3 else "")
        special = [t["t"] for t in tasks if t.get("special")]
        if special:
            n["special"].textContent = "Specific to this business: " + "; ".join(special)
        else:
            n["special_box"].remove()
