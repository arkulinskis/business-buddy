from anvil import *

from ._anvil_designer import BasicsTemplate
from ... import bb
from ..Guide import check_note

PICKS = ["Arrondissement", "NEQ", "TPS / TVQ", "Certificat (permis) d'occupation", "Bail commercial", "MAPAQ"]


class Basics(BasicsTemplate):
    """#basics (Read): the universal knowledge every Montréal business needs, as a six-stage roadmap of topics,
    plus a glossary teaser and the official sources. No server calls."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        topics = bb.DATA["topics"]
        self.dom_nodes["lead"].textContent = (
            "%d short, practical topics on what every small business here has to deal with: registering, taxes, borough "
            "permits, leases, hiring, French rules. Each one has the basics and a 'going deeper' part." % len(topics))
        by_stage = [(s, [t for t in topics if t["stage"] == s["id"]]) for s in bb.DATA["stages"]]
        self.steps_panel.items = [{"n": i + 1, "stage": s, "count": len(ts)} for i, (s, ts) in enumerate(by_stage)]
        self.stages_panel.items = [{"n": i + 1, "stage": s, "topics": ts} for i, (s, ts) in enumerate(by_stage)]
        self.gloss_panel.items = [w for w in bb.DATA["glossary"] if w[0] in PICKS]
        self.dom_nodes["all_terms"].textContent = "See all %d terms" % len(bb.DATA["glossary"])
        self.sources_panel.items = bb.DATA["sources"]
        self.dom_nodes["check_note"].textContent = check_note()
