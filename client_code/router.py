"""Page addresses: #name/arg1/arg2 -> a page Form (open_form), with sign-in rules.

Links in templates are plain <a href="#home">; code calls router.go("item", id).

    PAGES[name] = (who may open it, browser-tab title)   who: None = anyone, "guest" = signed out only, "user", "admin"
    NAV = the main menu (header + phone tab bar): (page, label, icon, who). Visitors get the public ones.
    Same addresses as the JavaScript version (#guide/<slug>, #plan/<id>/budget ...), so shared links keep working.
New page: add it to PAGES, to _form() and (if it belongs in the menu) to NAV.
"""
import anvil
import anvil.js
from anvil.js import window

from . import state

PAGES = {
    "landing": (None, "Welcome"),
    "auth": ("guest", "Sign in"),
    "library": (None, "Business guides"),
    "guide": (None, "Guide"),
    "basics": (None, "The Basics"),
    "topic": (None, "Basics"),
    "glossary": (None, "Glossary"),
    "tools": (None, "Tools"),
    "home": ("user", "Home"),
    "plan": ("user", "Launch plan"),
    "profile": ("user", "Your profile"),
    "admin": ("admin", "Admin"),
}
# The main menu (header + phone tab bar): (page, label, icon, who). Visitors see the public ones.
NAV = [("home", "Home", "home", "user"), ("library", "Guides", "grid", None), ("basics", "Basics", "map", None),
       ("tools", "Tools", "sliders", None)]
# Detail pages light up their section in the menus: a guide under Guides, a topic under Basics, a plan under Home.
PARENT = {"guide": "library", "topic": "basics", "glossary": "basics", "plan": "home"}
APP_NAME = "Business Buddy"
_r: dict = {"after": "", "listening": False}


def nav_links(page):
    me = state.me()
    active = PARENT.get(page, page)
    return [{"page": p, "label": label, "icon": icon, "on": p == active} for p, label, icon, who in NAV if me or not who]


def _title(name, args):
    """The browser-tab title: a guide or topic shows its own name."""
    if name in ("guide", "topic") and args:
        from . import bb
        info = bb.guide_info(args[0]) if name == "guide" else bb.topic_info(args[0])
        if info:
            return info.get("name") or info.get("title") or PAGES[name][1]
    return PAGES[name][1]


def _form(name):
    """The page's Form class (imported when first needed, so start-up stays quick)."""
    if name == "landing":
        from .Pages.Landing import Landing
        return Landing
    if name == "auth":
        from .Pages.Auth import Auth
        return Auth
    if name == "library":
        from .Pages.Library import Library
        return Library
    if name == "guide":
        from .Pages.Guide import Guide
        return Guide
    if name == "basics":
        from .Pages.Basics import Basics
        return Basics
    if name == "topic":
        from .Pages.Topic import Topic
        return Topic
    if name == "glossary":
        from .Pages.Glossary import Glossary
        return Glossary
    if name == "tools":
        from .Pages.Tools import Tools
        return Tools
    if name == "home":
        from .Pages.Home import Home
        return Home
    if name == "plan":
        from .Pages.Plan import Plan
        return Plan
    if name == "profile":
        from .Pages.Profile import Profile
        return Profile
    from .Pages.Admin import Admin
    return Admin


def parse(hash_text):
    h = (hash_text or "").lstrip("#").lstrip("!").lstrip("/").split("?")[0]
    parts = [window.decodeURIComponent(p) for p in h.split("/") if p]
    return (parts[0] if parts else ""), parts[1:]


def href(name, *args):
    """'#name/arg1/arg2' with every part URL-encoded (row ids contain brackets and commas)."""
    return "#" + "/".join([name] + [window.encodeURIComponent(str(a)) for a in args if a not in (None, "")])


def home_page():
    return "home" if state.me() else "landing"


def show():
    """Open the page for the current address."""
    name, args = parse(window.location.hash)
    if name not in PAGES:
        name, args = home_page(), []
    who = PAGES[name][0]
    if who == "guest" and state.me():
        name, args = "home", []
    elif who in ("user", "admin") and not state.me():
        _r["after"] = window.location.hash
        name, args = "auth", []
    elif who == "admin" and not state.is_admin():
        state.toast("That page is for admins only.", "error")
        name, args = "home", []
    window.document.title = _title(name, args) + " · " + APP_NAME
    window.UI_READY = False
    page = _form(name)(args=args)
    anvil.open_form(page)
    shell = getattr(page, "layout", None)
    if shell is not None and hasattr(shell, "refresh"):
        shell.refresh(name)  # Anvil reuses the layout between pages: tell it who is signed in and which page is open
    window.scrollTo(0, 0)
    window.UI_READY = True  # tests and screenshots wait for this


def go(name, *args):
    """Go to a page. Same address again = reload the page."""
    target = href(name, *args)
    if window.location.hash == target:
        show()
    else:
        window.location.hash = target


def replace(name, *args):
    """Change the address without opening anything (a page that switches its own view)."""
    window.history.replaceState(None, "", href(name, *args))


def after_sign_in():
    """Where to go once someone signs in: the page they were heading for, or home."""
    target = _r["after"]
    _r["after"] = ""
    if target and target != window.location.hash:
        window.location.hash = target
    else:
        go("home")


def remember_after(target):
    _r["after"] = target


def _on_hash(event):
    show()


def start():
    if not _r["listening"]:
        window.addEventListener("hashchange", anvil.js.report_exceptions(_on_hash))
        _r["listening"] = True
    show()
