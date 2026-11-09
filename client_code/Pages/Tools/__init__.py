import math

from anvil import *

from ._anvil_designer import ToolsTemplate
from ... import bb, state

TOOLS = ["finder", "breakeven", "taxes", "threshold", "rate", "structure"]

# ---------------------------------------------------------------- permit finder questions: (key, multi, label, options)
FQ = [
    ("where", False, "Where will you work?", [["premises", "A shop, studio or office", "store"], ["home", "At home", "home"],
                                              ["clients", "At clients' places or online only", "laptop"], ["mobile", "Truck, markets or events", "truck"]]),
    ("name", False, "What name will you use?", [["own", "My own first and last name"], ["name", "A business name"], ["inc", "I'll incorporate"]]),
    ("sales", False, "Sales in your first year?", [["low", "Under $30,000"], ["high", "Over $30,000"], ["unsure", "Not sure"]]),
    ("food", False, "Food?", [["none", "No food"], ["meals", "I prepare meals, snacks or drinks"], ["products", "I sell food products"],
                              ["home", "I cook at home to sell"]]),
    ("extra", True, "Anything else? (tick all that apply)", [
        ["alcohol", "Alcohol", "cup"], ["reno", "Renovation or construction work", "hammer"], ["electric", "Electrical work", "bolt"],
        ["plumbing", "Plumbing or heating", "wrench"], ["kids", "Childcare for 3+ kids at home", "baby"], ["dogs", "Walking 4+ dogs at once", "paw"],
        ["animals", "Keeping 15+ cats or dogs", "paw"], ["hire", "Hiring employees", "users"], ["sign", "A sign on a building", "store"],
        ["terrace", "A terrace", "sun"], ["door", "Selling at customers' homes / door-to-door", "home"], ["tobacco", "Tobacco", "bag"],
        ["drone", "Flying a drone", "camera"], ["truck", "A truck of 4,500 kg+", "truck"], ["auto", "Car repair with employees", "car"]]),
]
FINDER_DEFAULT = {"where": "premises", "name": "name", "sales": "low", "food": "none", "extra": ["sign"]}

# ---------------------------------------------------------------- structure quiz: (key, label, [value, label, points])
SQ = [
    ("people", "How many owners?", [["1", "Just me", 0], ["2", "Two of us", 1]]),
    ("profit", "Expected yearly profit after a year or two?", [["low", "Under $60,000", 0], ["mid", "$60,000–$120,000", 1], ["high", "Over $120,000", 2]]),
    ("keep", "Will you leave profits in the business (not spend them)?", [["no", "No, I need it to live", 0], ["some", "Some", 1], ["yes", "Yes, a lot", 2]]),
    ("risk", "Big contracts, debts or risks insurance won't cover?", [["no", "Not really", 0], ["yes", "Yes", 2]]),
    ("admin", "Your appetite for paperwork and accountant fees?", [["low", "Keep it simple", -1], ["ok", "Fine with it", 1]]),
]
SQ_DEFAULT = {"people": "1", "profit": "low", "keep": "no", "risk": "no", "admin": "low"}


def finder_result(a):
    """The permits that apply to the answers: [(permit id, why)]. Same rules as the JavaScript version."""
    out, ex = [], a.get("extra") or []

    def add(pid, why):
        if pid in bb.DATA["permits"] and pid not in [o[0] for o in out]:
            out.append((pid, why))

    if a.get("name") != "own" or "tobacco" in ex:
        add("req", "Tobacco sellers must register whatever their name." if a.get("name") == "own" else
            "Every corporation is registered (incorporation: $397)." if a.get("name") == "inc" else "You use a name other than your own.")
    if a.get("sales") == "high" or "tobacco" in ex:
        add("gstqst", "Mandatory above $30,000 of sales." if a.get("sales") == "high" else "Mandatory from the first dollar for tobacco.")
    elif a.get("sales") == "unsure":
        add("gstqst", "Watch the $30,000 threshold (use the tracker); registering early can pay.")
    if a.get("where") in ("premises", "home"):
        add("occupancy", "Home businesses need one too, in most cases." if a.get("where") == "home" else "Required for any business address.")
    if a.get("where") == "clients":
        add("occupancy", "If you run the business from a home office, the borough usually expects one.")
    if a.get("where") == "premises":
        add("renovation", "If you renovate the space (plumbing, walls, façade).")
    if "sign" in ex:
        add("sign", "Needs your occupancy permit first; French must dominate.")
    if "terrace" in ex:
        add("terrace", "Seasonal permit from the borough.")
    if a.get("food") in ("meals", "home"):
        add("mapaqRestaurant", "Home kitchens: max 100 kg/month, direct sales only." if a.get("food") == "home" else
            "Preparing food to eat on site or take away.")
    if a.get("food") == "products":
        add("mapaqRetail", "Selling food products to consumers.")
    if a.get("food") and a.get("food") != "none":
        add("foodTraining", "The manager course is mandatory for the person in charge.")
    for key, pid, why in (("alcohol", "racj", "Selling or serving alcohol, including bring-your-own-wine."),
                          ("reno", "rbq", "Renovation for clients needs the right RBQ subcategory."),
                          ("electric", "cmeq", "Electrical contracting goes through the CMEQ."),
                          ("plumbing", "cmmtq", "Plumbing and heating contracting goes through the CMMTQ."),
                          ("kids", "daycare", "Since Sept. 1, 2026, more than 2 children needs recognition."),
                          ("dogs", "dogwalker", "More than 3 dogs at once in Montréal (max 8)."),
                          ("animals", "animals15", "Keeping 15 or more cats or dogs."),
                          ("hire", "employer", "Before the first payday."),
                          ("door", "itinerant", "Contracts signed at the consumer's home."),
                          ("tobacco", "tobacco", "Plus age checks and display rules."),
                          ("drone", "drone", "For drones of 250 g to 25 kg."),
                          ("truck", "heavyVehicle", "Business trucks of 4,500 kg or more."),
                          ("auto", "autoDecree", "Montréal-region auto services with employees.")):
        if key in ex:
            add(pid, why)
    return out


class Quiz:
    """Answers for a set of Questions (items/Question calls host.answer and reads host.answers)."""

    def __init__(self, store_key, default, multi_keys, on_change):
        saved = bb.store_get(store_key, None)
        self.answers: dict = dict(default)
        if isinstance(saved, dict):
            self.answers.update(saved)
        self.store_key, self.multi, self.on_change = store_key, multi_keys, on_change

    def answer(self, key, value):
        if key in self.multi:
            cur = list(self.answers.get(key) or [])
            if value in cur:
                cur.remove(value)
            else:
                cur.append(value)
            self.answers[key] = cur
        else:
            self.answers[key] = value
        bb.store_set(self.store_key, self.answers)
        self.on_change()


class Tools(ToolsTemplate):
    """#tools/<finder|breakeven|taxes|threshold|rate|structure> (Operate): the permit finder and five calculators.
    Everything runs in the browser (no server calls); answers are remembered per browser under the JavaScript
    version's keys (finder, be, tx, th, rt, sq)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.tool = args[0] if args and args[0] in TOOLS else "finder"
        parts = {"finder": self.finder_part, "breakeven": self.breakeven_part, "taxes": self.taxes_part,
                 "threshold": self.threshold_part, "rate": self.rate_part, "structure": self.structure_part}
        tabs = {"finder": self.tab_finder, "breakeven": self.tab_breakeven, "taxes": self.tab_taxes,
                "threshold": self.tab_threshold, "rate": self.tab_rate, "structure": self.tab_structure}
        for name in TOOLS:
            parts[name].visible = name == self.tool
            tabs[name].classes["on"] = name == self.tool
            state.set_attr(tabs[name], "aria-current", "page" if name == self.tool else None)
        self.fields = {
            "be": [("fixed", self.be_fixed), ("pay", self.be_pay), ("price", self.be_price), ("varcost", self.be_varcost), ("days", self.be_days)],
            "th": [("q1", self.th_q1), ("q2", self.th_q2), ("q3", self.th_q3), ("q4", self.th_q4)],
            "rt": [("income", self.rt_income), ("expenses", self.rt_expenses), ("hours", self.rt_hours), ("billable", self.rt_billable),
                   ("weeks", self.rt_weeks)],
            "tx": [("amount", self.tx_amount)],
        }
        getattr(self, "_start_" + self.tool)()

    # ---- number fields shared by the calculators
    def _load(self, key, default):
        v = dict(default)
        saved = bb.store_get(key, None)
        if isinstance(saved, dict):
            v.update(saved)
        for name, box in self.fields[key]:
            box.text = bb.fmt_num(bb.number(v.get(name)))
            state.set_control_attr(box, "inputmode", "decimal")
            state.set_control_attr(box, "min", "0")
            box.add_event_handler("change", self._changed)
        return v

    def _read(self, key, v):
        for name, box in self.fields[key]:
            v[name] = bb.number(box.text)
        bb.store_set(key, v)
        return v

    def _changed(self, **event_args):
        getattr(self, "_draw_" + self.tool)()

    # ---- permit finder
    def _start_finder(self):
        self.fq = Quiz("finder", FINDER_DEFAULT, ["extra"], self._draw_finder)
        self.finder_panel.items = [{"key": k, "multi": multi, "label": label, "opts": opts, "host": self.fq} for k, multi, label, opts in FQ]
        self._draw_finder()

    def _draw_finder(self):
        res = finder_result(self.fq.answers)
        self.finder_title.text = "Your list: " + state.plural(len(res), "item")
        self.finder_result.items = [{"p": bb.DATA["permits"][pid], "why": why} for pid, why in res]
        self.finder_none.visible = not res

    # ---- break-even
    def _start_breakeven(self):
        self.be = self._load("be", {"fixed": 4500, "pay": 3500, "price": 35, "varcost": 6, "days": 22})
        self._draw_breakeven()

    def _draw_breakeven(self):
        v = self._read("be", self.be)
        margin, need = v["price"] - v["varcost"], v["fixed"] + v["pay"]
        self.be_error.visible = margin <= 0
        self.be_result.visible = margin > 0
        if margin <= 0:
            return
        sales = int(math.ceil(need / margin))
        per_day = sales / v["days"] if v["days"] else 0
        self.be_big.text = "{:,} sales".format(sales)
        self.be_per_day.text = "a month, about %s a day" % bb.fmt_num(math.ceil(per_day * 10) / 10)
        self.be_kv.items = [["Margin per sale", "%s (%d%%)" % (bb.money(margin, cents=True), int(round(margin / v["price"] * 100)))],
                            ["Revenue needed per month", bb.money(sales * v["price"])],
                            ["Revenue per year", bb.money(sales * v["price"] * 12)]]
        self.be_over.visible = sales * v["price"] * 12 > 30000
        self.be_tip.text = "Tip: each extra sale above break-even is %s of profit (before tax)." % bb.money(margin, cents=True)

    # ---- GST / QST
    def _start_taxes(self):
        self.tx = self._load("tx", {"amount": 100, "mode": "add"})
        self.tx_mode.add_event_handler("x-chip", self._tx_mode)
        self._draw_taxes()

    def _tx_mode(self, key, **event_args):
        self.tx["mode"] = key
        self._draw_taxes()
        state.refocus(self.tx_mode, "mode:" + key)

    def _draw_taxes(self):
        v = self._read("tx", self.tx)
        add = v.get("mode") != "remove"
        self.tx_mode.items = [{"key": "add", "label": "Add taxes to a price", "on": add, "group": "mode"},
                              {"key": "remove", "label": "Taxes are included: split them out", "on": not add, "group": "mode"}]
        base = v["amount"] if add else v["amount"] / 1.14975
        gst, qst = base * 0.05, base * 0.09975
        self.tx_title.text = "With taxes" if add else "Before taxes"
        self.tx_big.text = bb.money(base + gst + qst if add else base, cents=True)
        self.tx_kv.items = [["Price before taxes", bb.money(base, cents=True)], ["GST (5%)", bb.money(gst, cents=True)],
                            ["QST (9.975%)", bb.money(qst, cents=True)], ["Total", bb.money(base + gst + qst, cents=True)]]

    # ---- $30k tracker
    def _start_threshold(self):
        self.th = self._load("th", {"q1": 4000, "q2": 6500, "q3": 9000, "q4": 8000})
        self._draw_threshold()

    def _draw_threshold(self):
        v = self._read("th", self.th)
        qs = [v["q1"], v["q2"], v["q3"], v["q4"]]
        total, one = sum(qs), max(qs)
        over, single = total > 30000, one > 30000
        self.th_big.text = bb.money(total)
        pct = int(round(total / 300))
        self.dom_nodes["th_bar"].style.transform = "scaleX(%s)" % (min(100, total / 300) / 100)
        self.dom_nodes["th_meter"].classList.toggle("over", over)
        self.dom_nodes["th_meter"].setAttribute("aria-label", "%d%% of the $30,000 threshold" % pct)
        self.th_pct.text = "%d%% of the $30,000 threshold" % pct
        if single:
            self.th_msg.text = ("One quarter alone is over $30,000: you stop being a small supplier right away and must register "
                                "before the sale that crossed the line.")
        elif over:
            self.th_msg.text = ("You're over $30,000. You must register for GST/QST and start charging them by the end of the "
                                "month after the quarter in which you crossed it.")
        else:
            self.th_msg.text = "You're a small supplier: registering is optional. %s to go before it becomes mandatory." % bb.money(30000 - total)
        self.th_msg.role = ["msg-error"] if over or single else ["msg-note"]

    # ---- hourly rate
    def _start_rate(self):
        self.rt = self._load("rt", {"income": 55000, "expenses": 6000, "hours": 40, "billable": 60, "weeks": 4})
        self._draw_rate()

    def _draw_rate(self):
        v = self._read("rt", self.rt)
        qpp = min(v["income"], 74600) * 0.126 / 2  # rough: the employer half of QPP you pay as self-employed
        hours = max(1, v["hours"] * (v["billable"] / 100) * max(1, 52 - v["weeks"]))
        r = (v["income"] + v["expenses"] + qpp) / hours
        self.rt_big.text = bb.money(math.ceil(r)) + " / h"
        self.rt_kv.items = [["Billable hours per year", "{:,}".format(int(round(hours)))],
                            ["Extra QPP you pay as self-employed (approx.)", bb.money(qpp)],
                            ["Day rate (7 billable h)", bb.money(math.ceil(r) * 7)]]

    # ---- structure quiz
    def _start_structure(self):
        self.sq = Quiz("sq", SQ_DEFAULT, [], self._draw_structure)
        self.sq_panel.items = [{"key": k, "multi": False, "label": label, "opts": [o[:2] for o in opts], "host": self.sq} for k, label, opts in SQ]
        self._draw_structure()

    def _draw_structure(self):
        a = self.sq.answers
        score = 0
        for k, label, opts in SQ:
            for o in opts:
                if a.get(k) == o[0]:
                    score += int(o[2])
        two, inc = a.get("people") == "2", score >= 4
        maybe = score >= 2 and not inc
        if inc:
            title = "Consider incorporating"
            why = ("You expect profits you won't need to live on, or risks you want to keep away from your personal assets. "
                   "A corporation costs $397 to create plus yearly filings and accountant fees, so run the numbers with an accountant first.")
        elif maybe:
            title = "Start as a partnership, plan to incorporate" if two else "Start as a sole proprietor, revisit next year"
            why = ("Start simple and cheap. When profits grow beyond what you need to live on, a corporation may lower taxes: "
                   "you can move the business into one later.")
        else:
            title = "A registered partnership" if two else "A sole proprietorship"
            why = ("Simple, cheap and enough for most 1–2 person businesses starting out. Cover the lawsuit risk with liability insurance."
                   + (" Register the partnership and write a partnership agreement." if two else ""))
        self.sq_title.text = title
        self.sq_why.text = why
        self.sq_partners.visible = two
