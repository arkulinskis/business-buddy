from anvil import *

from ._anvil_designer import HomeTemplate
from ... import bb, router, state


class Home(HomeTemplate):
    """#home (Operate, members): the launch desk: your plans with progress and next steps, saved guides and topics,
    the tax calendar, what other Montréal founders read. Server: get_home."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me() or {}
        d: dict = state.call("get_home") or {}
        plans: list = d.get("plans") or []
        saved_rows: list = d.get("saved") or []
        popular_rows: list = d.get("popular") or []
        builders: int = d.get("builders") or 0
        n = self.dom_nodes
        n["hello"].textContent = "Bonjour, %s!" % ((me.get("name") or "").split(" ")[0] or "there")
        if plans:
            n["lead"].textContent = "Here's where your %s. One step at a time." % (
                "plan stands" if len(plans) == 1 else state.plural(len(plans), "plan") + " stand")
        else:
            n["lead"].textContent = "Pick the business you want to open and we'll turn it into a step-by-step plan."
        if builders > 1:
            n["builders"].textContent = "%d people are building a plan" % builders
        else:
            n["builders_badge"].remove()
        self.plans_panel.items = plans
        self.another_link.visible = bool(plans)
        self.start_card.visible = not plans
        saved = []
        for s in saved_rows:
            it = bb.guide_info(s["slug"]) if s["kind"] == "guide" else bb.topic_info(s["slug"])
            if it:
                saved.append({"href": router.href(s["kind"], s["slug"]), "icon": it["icon"],
                              "tile": "teal" if s["kind"] == "topic" else it.get("cat"), "label": it.get("name") or it.get("title")})
        self.saved_panel.items = saved
        self.no_saved.visible = not saved
        popular = []
        for p in popular_rows:
            g = bb.guide_info(p["slug"])
            if g:
                popular.append({"href": router.href("guide", g["slug"]), "icon": g["icon"], "tile": g["cat"], "label": g["name"],
                                "extra": state.plural(p["views"], "read")})
        self.popular_panel.items = popular
        self.popular_card.visible = bool(popular)
