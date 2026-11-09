from anvil import *

from ._anvil_designer import GlossaryTemplate
from ... import bb, state


class Glossary(GlossaryTemplate):
    """#glossary (Read): French ⇄ English terms from the borough counter, Revenu Québec, MAPAQ..., A to Z with
    letter headings, filterable (accents ignored). No server calls."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        state.set_control_attr(self.filter_box, "aria-label", "Filter the glossary")
        # (norm(all words), norm(french), entry), sorted by the French term without accents
        self.words = sorted([(bb.norm(" ".join(w)), bb.norm(w[0]), w) for w in bb.DATA["glossary"]], key=lambda x: x[1])
        self.draw("")

    def draw(self, q):
        q = bb.norm(q.strip())
        items, last = [], ""
        for words, head, w in self.words:
            if q and q not in words:
                continue
            letter = head[:1].upper()
            items.append({"w": w, "letter": letter if letter != last else ""})
            last = letter
        self.terms_panel.items = items
        self.no_terms.visible = not items

    @handle("filter_box", "change")
    def filter_box_change(self, **event_args):
        self.draw(self.filter_box.text or "")
