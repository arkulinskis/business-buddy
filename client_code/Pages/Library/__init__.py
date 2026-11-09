from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import LibraryTemplate
from ... import bb, router, state

FILTERS = [("home", "Can start at home", "home"), ("cheap", "Under $10k to start", "coins"), ("nolicence", "No trade licence", "check")]
SORTS = [("Most read", "popular"), ("Cheapest to start", "cheap"), ("Fastest to open", "fast"), ("A to Z", "az")]


class Library(LibraryTemplate):
    """#library[/<category>] (Operate): every business guide, searchable (guides, Basics topics and the glossary at
    once), filterable by category and by "start at home / under $10k / no special licence", sortable.
    #library?q=word opens with a search. Server: get_popular (quiet, for the "Most read" sort and badges)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        first = args[0] if args else ""
        self.cat = first if bb.category(first) else "all"
        self.flags: dict = {}
        self.sort = "popular"
        self.q = ""
        self.popular: dict = {}
        self._timer = None
        self.dom_nodes["lead"].textContent = (
            "%d businesses, Montréal edition. Each guide covers the permits, the real costs, the money maths and the "
            "advanced tricks for one kind of business." % len(bb.DATA["guides"]))
        self.sort_box.items = SORTS
        self.sort_box.selected_value = "popular"
        state.set_control_attr(self.sort_box, "aria-label", "Sort")
        state.set_control_attr(self.search_box, "aria-label", "Search guides and topics")
        state.set_control_attr(self.search_box, "autocomplete", "off")
        self.cats_panel.add_event_handler("x-chip", self._chip)
        self.filters_panel.add_event_handler("x-chip", self._chip)
        query = (window.location.hash.split("?") + [""])[1]
        for part in query.split("&"):
            if part.startswith("q="):
                self.q = window.decodeURIComponent(part[2:].replace("+", " "))
                self.search_box.text = self.q
        self._tick = anvil.js.report_exceptions(self._typed)
        self.draw()
        r = state.call_quiet("get_popular")
        if r:
            self.popular = {p["slug"]: p["views"] for p in r.get("guides") or []}
            self.draw()

    # ---- drawing
    def _chips(self):
        cats = [("all", "All", "grid")] + [(c["id"], c["name"], c["icon"]) for c in bb.DATA["categories"]]
        self.cats_panel.items = [{"key": k, "label": label, "icon": icon, "on": k == self.cat, "group": "cat"} for k, label, icon in cats]
        self.filters_panel.items = [{"key": k, "label": label, "icon": icon, "on": bool(self.flags.get(k)), "group": "filter"}
                                    for k, label, icon in FILTERS]

    def _guides(self):
        out = []
        for g in bb.DATA["guides"]:
            if self.cat != "all" and g["cat"] != self.cat:
                continue
            if self.flags.get("home") and not g["glance"].get("home"):
                continue
            if self.flags.get("cheap") and g["glance"]["cost"][0] >= 10000:
                continue
            if self.flags.get("nolicence") and any(p in bb.SPECIAL for p in g["permits"]):
                continue
            out.append(g)
        if self.sort == "cheap":
            out.sort(key=lambda g: g["glance"]["cost"][0])
        elif self.sort == "fast":
            out.sort(key=lambda g: g["glance"]["weeks"][0])
        elif self.sort == "az":
            out.sort(key=lambda g: g["name"].lower())
        else:
            out.sort(key=lambda g: (-self.popular.get(g["slug"], 0), g["name"].lower()))
        return out

    def draw(self):
        self._chips()
        searching = len(self.q.strip()) > 1
        self.results_part.visible = searching
        self.guides_part.visible = not searching
        if searching:
            hits = [h for h in bb.search(self.q) if self.cat == "all" or h["kind"] != "guide" or h.get("cat") == self.cat][:40]
            self.count_label.text = state.plural(len(hits), "result")
            self.hits_panel.items = hits
            self.no_hits.visible = not hits
            self.no_hits_title.text = 'Nothing found for "%s"' % self.q
            return
        gs = self._guides()
        self.count_label.text = state.plural(len(gs), "guide")
        self.no_guides.visible = not gs
        top = sorted(self.popular, key=lambda s: -self.popular[s])[:3]
        cards = []
        for g in gs:
            c = dict(g)
            c["popular"] = g["slug"] in top
            cards.append(c)
        if self.cat == "all" and self.sort == "az":
            groups = []
            for c in bb.DATA["categories"]:
                mine = [x for x in cards if x["cat"] == c["id"]]
                if mine:
                    groups.append({"cat": c, "guides": mine})
        else:
            groups = [{"cat": None, "guides": cards}] if cards else []
        self.groups_panel.items = groups

    # ---- events
    def _chip(self, key, group, **event_args):
        if group == "cat":
            self.cat = key
            if self.cat == "all":
                router.replace("library")
            else:
                router.replace("library", self.cat)
        else:
            self.flags[key] = not self.flags.get(key)
        self.draw()
        state.refocus(self.cats_panel if group == "cat" else self.filters_panel, "%s:%s" % (group, key))

    def _typed(self):
        self._timer = None
        self.q = self.search_box.text or ""
        self.draw()

    @handle("search_box", "change")
    def search_box_change(self, **event_args):
        if self._timer is not None:
            window.clearTimeout(self._timer)
        self._timer = window.setTimeout(self._tick, 140)

    @handle("search_box", "pressed_enter")
    def search_box_pressed_enter(self, **event_args):
        self._typed()

    @handle("sort_box", "change")
    def sort_box_change(self, **event_args):
        self.sort = self.sort_box.selected_value or "popular"
        self.draw()

    @handle("suggest_button", "click")
    def suggest_button_click(self, **event_args):
        state.feedback()
