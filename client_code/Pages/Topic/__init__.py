from anvil import *
from anvil.js import window

from ._anvil_designer import TopicTemplate
from ... import bb, router, state
from ..Guide import check_note


class Topic(TopicTemplate):
    """#topic/<slug> (Read): one Basics topic: the basics, then "going deeper", official links, the business guides
    that use it, related topics, save + helpful vote. Server: page_state, vote, toggle_save."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        t = bb.topic(args[0] if args else "")
        self.missing.visible = t is None
        self.page.visible = t is not None
        if t is None:
            return
        n = self.dom_nodes
        stage = bb.stage(t["stage"])
        n["stage"].textContent = stage["name"] if stage else ""
        n["icon"].classList.add("ic-" + t["icon"])
        n["title"].textContent = t["title"]
        n["fr"].textContent = t["fr"]
        n["summary"].textContent = t["summary"]
        n["minutes"].textContent = "%d min read" % t["minutes"]
        n["check_note"].textContent = check_note()
        deeper = t.get("deeper") or []
        n["skip"].setAttribute("href", router.href("topic", t["slug"]))
        if not deeper:
            n["skip"].remove()
        self.basics_panel.items = t.get("basics") or []
        self.deeper_part.visible = bool(deeper)
        self.deeper_panel.items = deeper
        links = t.get("links") or []
        self.links_part.visible = bool(links)
        self.links_panel.items = links
        users = [g for g in bb.DATA["guides"] if t["slug"] in (g.get("topics") or [])]
        self.guides_part.visible = bool(users)
        self.guides_panel.items = [{"href": router.href("guide", g["slug"]), "label": g["name"], "icon": g["icon"]} for g in users]
        related = [r for r in (bb.topic_info(s) for s in t.get("related") or []) if r]
        self.related_part.visible = bool(related)
        self.related_panel.items = related
        st = state.call_quiet("page_state", "topic", t["slug"])
        st = st if isinstance(st, dict) and st.get("ok") is not False else {"saved": False}
        self.save.setup("topic", t["slug"], st)
        self.vote.setup("topic", t["slug"], st)

    def skip_click(self, event):
        event.preventDefault()
        el = window.document.getElementById("tp-deeper")
        if el:
            el.scrollIntoView({"behavior": "smooth"})
