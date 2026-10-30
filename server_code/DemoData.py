"""Demo content, so the app never looks empty. Loaded automatically the first time anyone opens the app
(ensure_loaded), removed or reloaded from Admin -> Demo data. Removing it is remembered: it doesn't come back.

Demo users have is_demo=True and @example.com emails; they can't sign in (no password). Every demo row
is flagged is_demo=True, so remove() deletes exactly what load() added.
What it adds: four fictional founders with launch plans (they count in "people building a plan"), their
saved pages and votes, and page-view counts so "Popular in Montréal" has something to show.
Task ids must match the checklist ids in web/pages/_kb_core.html (universal tasks) and the guides.
"""
import datetime as dt

from anvil.tables import app_tables

from . import common as C

DEMO_USERS = [
    ("Maya Chen", "maya.demo@example.com"),
    ("Theo Martin", "theo.demo@example.com"),
    ("Ines Ozola", "ines.demo@example.com"),
    ("Karim Haddad", "karim.demo@example.com"),
]
# (user index, guide slug, title, area, opening in N days, done task ids, cost sheet)
DEMO_PLANS = [
    (0, "barber-shop", "Fade Factory", "Rosemont–La Petite-Patrie", 75,
     ["idea.talk", "idea.compete", "idea.plan", "idea.budget", "idea.coach", "legal.structure", "legal.name", "legal.req",
      "legal.bank", "place.zoning"],
     [("Two barber chairs (used)", 2400, "once"), ("Clippers, trimmers, tools", 1800, "once"), ("Renovation + plumbing", 9000, "once"),
      ("Sign + permit", 1600, "once"), ("Rent", 1900, "monthly"), ("Insurance", 95, "monthly"), ("Booking app", 60, "monthly")]),
    (1, "bakery", "Pain Perdu", "Verdun", 140,
     ["idea.talk", "idea.compete", "idea.plan", "idea.budget", "legal.structure", "legal.partner"],
     [("Deck oven (used)", 14000, "once"), ("Mixer 20 qt", 4200, "once"), ("Fridges + racks", 5500, "once"),
      ("Rent", 2800, "monthly"), ("Flour, butter, supplies", 3200, "monthly")]),
    (2, "cleaning", "Sparkle & Co", "Le Plateau-Mont-Royal", 20,
     ["idea.talk", "idea.compete", "idea.plan", "idea.budget", "legal.structure", "legal.name", "legal.req", "legal.bank",
      "setup.insurance", "setup.equipment", "setup.pay"],
     [("Vacuums + supplies", 900, "once"), ("Website + logo", 400, "once"), ("Insurance", 70, "monthly"), ("Car costs", 350, "monthly")]),
    (3, "cafe", "Café Escale", "Villeray–Saint-Michel–Parc-Extension", 200,
     ["idea.talk", "idea.compete"],
     [("Espresso machine (2 groups)", 11000, "once"), ("Grinders", 2600, "once"), ("Rent", 3100, "monthly")]),
]
DEMO_SAVED = [(0, "guide", "barber-shop"), (0, "topic", "occupancy-permit"), (1, "topic", "food-permits"),
              (1, "topic", "commercial-lease"), (2, "topic", "gst-qst"), (3, "guide", "bakery")]
DEMO_VOTES = [(0, "guide", "barber-shop", True), (1, "guide", "bakery", True), (2, "topic", "gst-qst", True),
              (3, "topic", "food-permits", True), (2, "guide", "cleaning", True), (3, "topic", "commercial-lease", False)]
DEMO_VIEWS = {
    "guide": {"barber-shop": 412, "bakery": 388, "cafe": 351, "cleaning": 297, "food-truck": 266, "home-food": 241,
              "beauty-studio": 198, "dog-walking": 176, "handyman-renovation": 165, "online-shop": 158, "home-daycare": 149,
              "depanneur": 121, "photography": 97, "tattoo-studio": 93},
    "topic": {"roadmap": 530, "gst-qst": 402, "occupancy-permit": 377, "register": 344, "structure": 290, "food-permits": 261,
              "financing": 255, "commercial-lease": 198, "french-rules": 187, "working-from-home": 172},
}
# Tables that hold demo rows (each has an is_demo column). Children before parents.
DEMO_TABLES = ["plans", "saved", "votes", "page_stats"]


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    """Call from the app's main data callables: loads the demo once, unless an admin removed it."""
    if state() == "never":
        load()


def load():
    remove(remember=False)
    users = []
    for name, email in DEMO_USERS:
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, signed_up=C.now() - dt.timedelta(days=40))
        users.append(u)
    today = C.now().date()
    for i, (who, guide, title, area, days, done, costs) in enumerate(DEMO_PLANS):
        app_tables.plans.add_row(owner=users[who], guide=guide, title=title, area=area,
                                 target_date=today + dt.timedelta(days=days), done=list(done), notes={},
                                 costs=[{"label": l, "amount": a, "kind": k} for l, a, k in costs], hiring=False,
                                 created=C.now() - dt.timedelta(days=30 - i), updated=C.now() - dt.timedelta(days=i + 1),
                                 is_demo=True)
    for who, kind, slug in DEMO_SAVED:
        app_tables.saved.add_row(owner=users[who], kind=kind, slug=slug, created=C.now() - dt.timedelta(days=5), is_demo=True)
    for who, kind, slug, helpful in DEMO_VOTES:
        app_tables.votes.add_row(user=users[who], kind=kind, slug=slug, helpful=helpful, created=C.now() - dt.timedelta(days=3),
                                 is_demo=True)
    for kind, views in DEMO_VIEWS.items():
        for slug, n in views.items():
            app_tables.page_stats.add_row(kind=kind, slug=slug, views=n, is_demo=True)
    C.set_setting("demo", "loaded")
    return counts()


def remove(remember=True):
    for name in DEMO_TABLES:
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in DEMO_TABLES:
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out
