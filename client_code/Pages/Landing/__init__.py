from anvil import *

from ._anvil_designer import LandingTemplate
from ... import bb, state

# The app's video on the Addanapp YouTube channel (APP_MAKER/youtube/manifest.json), shown in the Watch section.
YT_VIDEO = "Yw346NsYCr0"


class Landing(LandingTemplate):
    """#landing (Persuade; also "About" for members): the promise with the storefront street, the business
    categories (live from the guides), the Watch section, how it works, the Montréal part, features, FAQ.
    Static copy lives in the template; the numbers come from the knowledge base (bb)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.guest_cta.visible = not me
        self.member_cta.visible = bool(me)
        bakery = bb.guide_info("bakery")
        self.dom_nodes["bakery_cost"].textContent = (bb.cost_range(bakery["glance"]["cost"]) + " to start") if bakery else ""
        cats = []
        for c in bb.DATA["categories"]:
            row = dict(c)
            row["n"] = len([g for g in bb.DATA["guides"] if g["cat"] == c["id"]])
            cats.append(row)
        self.cats_panel.items = cats
        self.dom_nodes["legal_answer"].textContent = (
            "No. It's carefully researched general information (checked in %s) with links to the official sources. "
            "Fees change every year and rules differ by borough, so confirm before you pay or sign, and see a lawyer or "
            "accountant for your specific situation." % bb.DATA["updated"])
        self.dom_nodes["yt_cover"].addEventListener("click", self._play)

    def _play(self, event):
        # Swap the cover for YouTube's privacy-enhanced player only when it's pressed (nothing loads before).
        self.dom_nodes["yt_frame"].innerHTML = (
            '<iframe src="https://www.youtube-nocookie.com/embed/' + YT_VIDEO + '?autoplay=1&rel=0&playsinline=1" '
            'title="Business Buddy video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" '
            'allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>')
