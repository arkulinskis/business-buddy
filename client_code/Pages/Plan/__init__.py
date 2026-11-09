from anvil import *
from anvil.js import window

from ._anvil_designer import PlanTemplate
from ... import bb, router, state

TABS = ["checklist", "budget", "details"]


class Plan(PlanTemplate):
    """A personal launch plan (Operate, members).
        #plan/new/<guide>           create one (type, working name, borough, opening date, starter budget)
        #plan/<id>                  the checklist: the guide's phases and tasks, tick + private note
        #plan/<id>/budget           the editable startup cost sheet with totals
        #plan/<id>/details          name, borough, opening date, hiring (adds the employer steps), delete
    Items/PlanPhase + Items/Task and Items/BudgetRow call back into this page (host).
    Server: create_plan, get_plan, set_task, set_note, save_costs, update_plan, delete_plan."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.plan: dict = {}
        self.g = None
        self.rows: list = []
        is_new = not args or args[0] == "new"
        self.new_part.visible = is_new
        self.plan_part.visible = not is_new
        if is_new:
            self._start_new(args[1] if len(args) > 1 else "")
            return
        self.plan_id = args[0]
        self.tab = args[1] if len(args) > 1 and args[1] in TABS else "checklist"
        self.closed: dict = {}
        saved = bb.store_get("closed." + self.plan_id, None)
        if isinstance(saved, dict):
            self.closed = saved
        for name, el in (("checklist", self.tab_checklist), ("budget", self.tab_budget), ("details", self.tab_details)):
            state.set_attr(el, "href", router.href("plan", self.plan_id, "" if name == "checklist" else name))
            el.classes["on"] = name == self.tab
            state.set_attr(el, "aria-current", "page" if name == self.tab else None)
        r = state.call("get_plan", self.plan_id)
        if not r:
            router.go("home")
            return
        self.plan = r["plan"]
        self.g = bb.guide_info(self.plan["guide"])
        self.draw()

    # ---------------------------------------------------------------- new plan
    def _areas(self, box):
        box.items = [(b, b) for b in bb.DATA["boroughs"]]

    def _date_box(self, box):
        state.set_control_attr(box, "type", "date")

    def _start_new(self, slug):
        items = []
        for c in bb.DATA["categories"]:
            items += [("%s: %s" % (c["name"], g["name"]), g["slug"]) for g in bb.DATA["guides"] if g["cat"] == c["id"]]
        self.new_guide.items = items
        self._areas(self.new_area)
        self._date_box(self.new_date)
        state.set_control_attr(self.new_title, "maxlength", "80")
        g = bb.guide_info(slug)
        if g:
            self.new_guide.selected_value = g["slug"]
            self.new_title.text = "My " + g["name"].lower()

    @handle("new_guide", "change")
    def new_guide_change(self, **event_args):
        g = bb.guide_info(self.new_guide.selected_value)
        title = self.new_title.text or ""
        if g and (not title or title.startswith("My ")):
            self.new_title.text = "My " + g["name"].lower()

    @handle("create_button", "click")
    def create_button_click(self, **event_args):
        slug = self.new_guide.selected_value
        title = (self.new_title.text or "").strip()
        if not slug:
            state.toast("Choose the type of business first.", "error")
            return
        if not title:
            state.toast("Give your business a working name.", "error")
            return
        costs = bb.starter_costs(slug) if self.new_costs.checked else []
        r = state.call("create_plan", slug, title, self.new_area.selected_value or "", self.new_date.text or None, costs)
        if r:
            state.toast("Your plan is ready. Let's go!", "ok")
            router.go("plan", r["plan"]["id"])

    # ---------------------------------------------------------------- the plan
    def draw(self):
        p = self.plan
        self.checklist_part.visible = self.tab == "checklist"
        self.budget_part.visible = self.tab == "budget"
        self.details_part.visible = self.tab == "details"
        n = self.dom_nodes
        n["title"].textContent = p["title"]
        window.document.title = p["title"] + " · Business Buddy"
        if self.g:
            n["guide_name"].textContent = self.g["name"] + " launch plan"
            n["guide_link"].setAttribute("href", router.href("guide", self.g["slug"]))
            n["guide_link"].style.display = ""
        else:
            n["guide_name"].textContent = p["guide"]
            n["guide_link"].style.display = "none"
        n["area_badge"].style.display = "" if p.get("area") else "none"
        n["area"].textContent = p.get("area") or ""
        days = bb.days_until(p.get("target_date"))
        badge = n["date_badge"]
        badge.className = "ui-badge"
        if days is None:
            n["date"].textContent = "No opening date"
        else:
            badge.classList.add("good" if days < 0 else "warn" if days < 30 else "brand")
            n["date"].textContent = ("Opening in " + state.plural(days, "day")) if days >= 0 else ("Opened " + state.plural(-days, "day") + " ago")
        n["hiring_badge"].style.display = "" if p.get("hiring") else "none"
        self.refresh_head()
        if self.tab == "checklist":
            self.phases_panel.items = [{"ph": ph, "n": i + 1, "host": self} for i, ph in enumerate(bb.phases(p["guide"], p.get("hiring")))]
        elif self.tab == "budget":
            self.rows = [dict(c) for c in p.get("costs") or []]
            self.rows_panel.items = [{"row": r, "host": self} for r in self.rows]
            self.dirty_label.text = ""
            self.totals()
            n["typical"].textContent = ("Typical for a %s in Montréal: %s to start. See the cost table in the guide." % (
                self.g["name"].lower(), bb.cost_range(self.g["glance"]["cost"]))) if self.g else ""
        else:
            self.d_title.text = p["title"]
            state.set_control_attr(self.d_title, "maxlength", "80")
            self._areas(self.d_area)
            if p.get("area") in bb.DATA["boroughs"]:
                self.d_area.selected_value = p["area"]
            self._date_box(self.d_date)
            self.d_date.text = p.get("target_date") or ""
            self.d_hiring.checked = bool(p.get("hiring"))

    def refresh_head(self):
        pr = bb.progress(self.plan)
        n = self.dom_nodes
        n["ring"].style.setProperty("--p", str(pr["pct"]))
        n["ring"].setAttribute("aria-label", "%d%% done" % pr["pct"])
        n["pct"].textContent = "%d%%" % pr["pct"]
        n["count"].textContent = "%d / %d steps" % (pr["done"], pr["total"])
        return pr

    # ---- checklist (called by Items/PlanPhase and Items/Task)
    def done_ids(self):
        return self.plan.get("done") or []

    def note(self, task_id):
        return (self.plan.get("notes") or {}).get(task_id) or ""

    def guide_name(self):
        return self.g["name"] if self.g else ""

    def is_closed(self, phase_id, all_done):
        v = self.closed.get(phase_id)
        return all_done if v is None else bool(v)

    def set_closed(self, phase_id, closed):
        self.closed[phase_id] = closed
        bb.store_set("closed." + self.plan_id, self.closed)

    def tick(self, task_id, on, phase, task):
        n_before, total = phase.counts()
        done = [x for x in self.done_ids() if x != task_id]
        if on:
            done.append(task_id)
        self.plan["done"] = done
        phase.draw()
        self.refresh_head()
        r = state.call_quiet("set_task", self.plan_id, task_id, on)
        if isinstance(r, dict) and r.get("ok") is not False and "done" in r:
            self.plan["done"] = r["done"]
        elif r is None or (isinstance(r, dict) and r.get("ok") is False):
            self.plan["done"] = [x for x in self.done_ids() if x != task_id] + ([] if on else [task_id])
            state.toast((r or {}).get("error") or "That didn't save. Try again.", "error")
            task.draw()
            phase.draw()
            self.refresh_head()
            return
        n_after, total = phase.counts()
        if on and n_after == total and n_before < total:
            window.BB.confetti()
            pr = self.refresh_head()
            state.toast("Every step done. Time to open the doors!" if pr["pct"] == 100 else 'Phase complete: "%s"' % phase.ph["name"], "ok")

    def save_note(self, task_id, text):
        r = state.call("set_note", self.plan_id, task_id, text)
        if not r:
            return False
        notes = dict(self.plan.get("notes") or {})
        if r.get("note"):
            notes[task_id] = r["note"]
        else:
            notes.pop(task_id, None)
        self.plan["notes"] = notes
        state.toast("Note saved", "ok")
        return True

    # ---- budget (called by Items/BudgetRow)
    def totals(self):
        once = sum(r.get("amount") or 0 for r in self.rows if r.get("kind") != "monthly")
        monthly = sum(r.get("amount") or 0 for r in self.rows if r.get("kind") == "monthly")
        self.t_once.text = bb.money(once)
        self.t_monthly.text = bb.money(monthly)
        self.t_safe.text = bb.money((once + 6 * monthly) * 1.15)

    def budget_changed(self):
        self.dirty_label.text = "Unsaved changes"
        self.totals()

    def remove_row(self, row):
        self.rows = [r for r in self.rows if r is not row]
        self.rows_panel.items = [{"row": r, "host": self} for r in self.rows]
        self.budget_changed()

    @handle("add_row_button", "click")
    def add_row_button_click(self, **event_args):
        self.rows.append({"label": "", "amount": "", "kind": "once"})
        self.rows_panel.items = [{"row": r, "host": self} for r in self.rows]
        self.budget_changed()
        last = self.rows_panel.get_components()[-1]
        getattr(last, "label_box").focus()

    @handle("save_budget_button", "click")
    def save_budget_button_click(self, **event_args):
        rows = [{"label": r.get("label") or "", "amount": bb.number(r.get("amount")), "kind": r.get("kind") or "once"} for r in self.rows]
        r = state.call("save_costs", self.plan_id, rows)
        if r:
            self.plan = r["plan"]
            state.toast("Budget saved", "ok")
            self.draw()

    # ---- details
    @handle("save_details_button", "click")
    def save_details_button_click(self, **event_args):
        r = state.call("update_plan", self.plan_id, self.d_title.text or "", self.d_area.selected_value or "",
                       self.d_date.text or None, bool(self.d_hiring.checked))
        if r:
            self.plan = r["plan"]
            state.toast("Saved", "ok")
            self.draw()

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        if confirm("Your checklist, notes and budget for this plan are deleted. This can't be undone.",
                   title='Delete "%s"?' % self.plan["title"], buttons=[("Cancel", False), ("Delete plan", True)], role="app-dialog"):
            if state.call("delete_plan", self.plan_id):
                state.toast("Plan deleted")
                router.go("home")
