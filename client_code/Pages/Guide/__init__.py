from anvil import *
from anvil.js import window

from ._anvil_designer import GuideTemplate
from ... import bb, router, state


def check_note():
    return ("Checked in %s. Fees and rules change every year and can differ by borough: confirm with the official source "
            "before you pay or sign. This is general information, not legal or tax advice." % bb.DATA["updated"])


class Guide(GuideTemplate):
    """#guide/<slug> (Read): one business guide: at a glance, permits, special rules, startup costs, the money,
    tips, going deeper, pitfalls, the roadmap preview, sources, related Basics, save + helpful vote, print.
    Server: page_state (views, votes, saved, your plan for it), vote, toggle_save."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        g = bb.guide(args[0] if args else "")
        self.missing.visible = g is None
        self.page.visible = g is not None
        if g is None:
            return
        self.g = g
        n = self.dom_nodes
        cat = bb.category(g["cat"])
        n["hero"].classList.add("bb-cat-" + g["cat"])
        n["cat_link"].setAttribute("href", router.href("library", g["cat"]))
        n["cat_link"].textContent = cat["name"] if cat else ""
        n["icon"].classList.add("ic-" + g["icon"])
        n["name"].textContent = g["name"]
        n["fr"].textContent = g["fr"]
        n["tagline"].textContent = g["tagline"]
        gl = g["glance"]
        n["g_cost"].textContent = bb.cost_range(gl["cost"])
        n["g_weeks"].textContent = bb.weeks(gl["weeks"])
        n["g_diff"].textContent = bb.diff_label(gl["difficulty"])
        n["dots"].setAttribute("aria-label", "Difficulty %d of 5" % gl["difficulty"])
        for i, dot in enumerate(bb.children(n["dots"])):
            if i < gl["difficulty"]:
                dot.classList.add("on")
        for a in bb.children(n["toc"]):  # the jump links keep the guide's own address (a #gd-x address is no page)
            a.setAttribute("href", router.href("guide", g["slug"]))
        n["g_home"].textContent = "Possible" if gl.get("home") else "Needs premises"
        self._plan_links(None)
        # sections
        self.intro.content = g["intro"]
        n["check_note"].textContent = check_note()
        permits = bb.DATA["permits"]
        self.permits_panel.items = [permits[p] for p in g["permits"] if p in permits]
        self.rules_panel.items = g.get("rules") or []
        once = [c for c in g["costs"] if c[3] != "monthly"]
        monthly = [c for c in g["costs"] if c[3] == "monthly"]
        t_once = [sum(c[1] for c in once), sum(c[2] for c in once)]
        t_month = [sum(c[1] for c in monthly), sum(c[2] for c in monthly)]
        self.once_table.visible = bool(once)
        self.monthly_table.visible = bool(monthly)
        self.once_panel.items = [{"label": c[0], "low": c[1], "high": c[2]} for c in once] + \
            [{"label": "Total", "low": t_once[0], "high": t_once[1], "total": True}]
        self.monthly_panel.items = [{"label": c[0], "low": c[1], "high": c[2]} for c in monthly] + \
            [{"label": "Total per month", "low": t_month[0], "high": t_month[1], "total": True}]
        n["safe"].textContent = "%s to %s" % (bb.money((t_once[0] + 6 * t_month[0]) * 1.15), bb.money((t_once[1] + 6 * t_month[1]) * 1.15))
        self.money.content = g.get("money") or ""
        self.tips_panel.items = [{"text": t, "icon": "check"} for t in g.get("tips") or []]
        self.pro_panel.items = [{"text": t, "icon": "star"} for t in g.get("pro") or []]
        self.pitfalls_panel.items = [{"text": t, "icon": "x"} for t in g.get("pitfalls") or []]
        self.phases_panel.items = [{"n": i + 1, "ph": ph} for i, ph in enumerate(bb.phases(g["slug"], False))]
        self.sources_panel.items = list(g.get("links") or []) + [["BizPaL: permits for your activity and address", "https://bizpal-perle.ca/"]]
        self.topics_panel.items = [t for t in (bb.topic_info(s) for s in g.get("topics") or []) if t]
        # counts the view; returns votes, saved and the member's plan for this guide
        st = state.call_quiet("page_state", "guide", g["slug"])
        st = st if isinstance(st, dict) and st.get("ok") is not False else {"saved": False}
        self.save.setup("guide", g["slug"], st)
        self.vote.setup("guide", g["slug"], st)
        if st.get("plan"):
            self._plan_links(st["plan"])

    def _plan_links(self, plan):
        n = self.dom_nodes
        if plan:
            href = router.href("plan", plan["id"])
            n["plan_icon"].className = "ic ic-list"
            n["plan_text"].textContent = "Open my plan"
            n["plan_text2"].textContent = 'Open "%s"' % plan["title"]
        else:
            href = router.href("plan", "new", self.g["slug"])
        n["plan_link"].setAttribute("href", href)
        n["plan_link2"].setAttribute("href", href)

    def jump_click(self, event):
        event.preventDefault()
        el = window.document.getElementById("gd-" + event.currentTarget.getAttribute("data-jump"))
        if el:
            el.scrollIntoView({"behavior": "smooth"})

    @handle("print_button", "click")
    def print_button_click(self, **event_args):
        window.print()
