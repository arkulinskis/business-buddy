"""Before you sign the lease (#tools/lease): the rules, as pure Python (no Anvil, no browser), so they can be unit-tested.

    QUESTIONS                 9 questions: (key, label, [[value, label, icon?], ...])
    evaluate(answers) -> {"answered", "verdict": red|amber|green|None, "headline", "summary",
                          "ask": [item], "lease": [item], "order": [item]}
    item = {"level": "red"|"amber"|"green", "title", "text", "url" (official page or ""), "topic" (Basics slug or "")}

Every fact is from the official pages linked on the items (checked 2026-11-20): montreal.ca "Open a business or launch a
company" (check zoning BEFORE renting; the renovation permit may be required for the occupancy permit; a sign needs the
occupancy certificate or an application), montreal.ca occupancy permit (tied to the premises AND the operator, so a new
operator needs a new one; a conversion permit may come first for new premises, a change of use or work; a bar or
restaurant needs it before the RACJ liquor permit), montreal.ca sign permit (PIIA review by the CCU in some areas; a new
owner keeping an old sign needs a permit), quebec.ca MAPAQ permits (no sales before the permit; 2-6 weeks; check with
the municipality first) and CBC on Côte-des-Neiges-NDG's fast-food streets.
"""

OPEN = "https://montreal.ca/en/articles/open-business-or-launch-company-18507"
OCC = "https://montreal.ca/en/how-to/get-occupancy-permit-commercial-industrial-or-professional-activity"
RENO = "https://montreal.ca/articles/renovations-combien-coute-un-permis-2715"
SIGN = "https://montreal.ca/en/how-to/obtaining-commercial-sign-permit"
TERRACE = "https://montreal.ca/services/terrasse-commerciale-sur-le-domaine-public"
MAPAQ = "https://www.quebec.ca/entreprises-et-travailleurs-autonomes/industrie-bioalimentaire/permis-alimentaires/permis-restauration-vente-detail"
RACJ = "https://www.racj.gouv.qc.ca/"
FASTFOOD = "https://www.cbc.ca/news/canada/montreal/supreme-court-cdn-ndg-fast-food-1.6397287"

QUESTIONS = [
    ("confirmed", "Has the borough confirmed your activity is allowed at this address?",
     [["written", "Yes, in writing", "check"], ["verbal", "Yes, by phone or at the counter", "chat"], ["no", "Not yet", "x"]]),
    ("prev", "What was the space used for before?",
     [["same", "The same kind of business"], ["other", "A different business"], ["home", "A home (apartment)"],
      ["empty", "Nothing: new or empty for years"], ["unknown", "I don't know"]]),
    ("reno", "Will you renovate?",
     [["none", "No, paint and furniture only"], ["inside", "Inside: walls, plumbing, electrical, ventilation"],
      ["facade", "Inside and the storefront"]]),
    ("food", "Food?", [["none", "No food"], ["products", "I sell food products"], ["prep", "I prepare food or drinks"]]),
    ("alcohol", "Alcohol?", [["no", "No"], ["yes", "Yes: sell, serve or bring-your-own"]]),
    ("sign", "A sign on the building or window?", [["no", "No"], ["yes", "Yes"]]),
    ("terrace", "A terrace outside?", [["no", "No"], ["yes", "Yes"]]),
    ("piia", "Is the street under special design rules (PIIA, heritage)?", [["no", "No"], ["yes", "Yes"], ["unknown", "I don't know"]]),
    ("nearby", "Is a similar business already close by?", [["no", "No"], ["yes", "Yes"], ["unknown", "I don't know"]]),
]
KEYS = [q[0] for q in QUESTIONS]
RANK = {"red": 2, "amber": 1, "green": 0}


def _item(level, title, text, url="", topic=""):
    return {"level": level, "title": title, "text": text, "url": url, "topic": topic}


def evaluate(answers):
    a = {k: (answers or {}).get(k) for k in KEYS}
    answered = len([k for k in KEYS if a[k]])
    ask, lease, order = [], [], []

    # ---- the use: zoning, the space's history
    if a["confirmed"] == "no":
        ask.append(_item("red", "Don't sign before the borough confirms the use",
                         "The City's advice: before you rent or buy, make sure zoning allows your activity. Call or visit the "
                         "permit counter (comptoir des permis) of the borough and name the exact use, for example "
                         "\"a café with 20 seats\".", OPEN, "occupancy-permit"))
    elif a["confirmed"] == "verbal":
        ask.append(_item("amber", "Get the confirmation in writing",
                         "Ask the permit counter to confirm it by email, or apply for the occupancy permit before you sign "
                         "and make the lease depend on it.", OCC, "occupancy-permit"))
    elif a["confirmed"] == "written":
        ask.append(_item("green", "The use is confirmed in writing", "Keep that email with your lease papers.", OCC))

    if a["prev"] == "unknown":
        ask.append(_item("red", "Find out what the space was used for",
                         "Ask the landlord for the last occupancy permit, or ask the permit counter. A new use can mean a "
                         "renovation (conversion) permit and building work before you may open.", OCC, "occupancy-permit"))
    elif a["prev"] == "home":
        ask.append(_item("red", "A home turned into a business is a change of use",
                         "Zoning may not allow it, and the borough may require a conversion permit and work before the "
                         "occupancy permit. Confirm both before anything else.", OCC, "occupancy-permit"))
    elif a["prev"] == "other":
        ask.append(_item("amber", "Ask whether it's a change of use",
                         "If your activity is a change of use under the Construction Code, a conversion permit may be "
                         "required before the occupancy permit, often with upgrades (washrooms, exits, fire separation).",
                         OCC, "occupancy-permit"))
    elif a["prev"] == "empty":
        ask.append(_item("amber", "New premises: expect a conversion permit",
                         "For a new location, or one with no history of activity, the borough may require a conversion "
                         "permit before the occupancy permit.", OCC, "occupancy-permit"))
    elif a["prev"] == "same":
        ask.append(_item("green", "Same kind of business: easier, not automatic",
                         "You still need your own occupancy permit: it belongs to the premises and the operator, so it ends "
                         "with the last owner. Ask the landlord for the previous permit; it helps your file.", OCC,
                         "occupancy-permit"))

    if a["nearby"] == "yes":
        ask.append(_item("amber", "Ask about distance and quota rules",
                         "Some boroughs limit where certain uses may open. Côte-des-Neiges–Notre-Dame-de-Grâce, for example, "
                         "keeps new fast-food restaurants to a handful of streets. Ask whether a rule like that applies to "
                         "your use here.", FASTFOOD, "occupancy-permit"))
    elif a["nearby"] == "unknown":
        ask.append(_item("amber", "Walk the block first",
                         "Look for similar businesses nearby, then ask the permit counter whether a distance or quota rule "
                         "applies to your use (some boroughs have them).", FASTFOOD))

    if a["piia"] == "yes":
        ask.append(_item("amber", "Design review adds time",
                         "In PIIA areas, sign and façade plans can go to the borough's urban planning advisory committee "
                         "(CCU). Plan extra weeks and expect limits on materials and size.", SIGN, "signs-renovations"))
    elif a["piia"] == "unknown":
        ask.append(_item("amber", "Ask whether a PIIA applies",
                         "Some streets have extra design rules for signs and façades (PIIA). The permit counter can tell you.",
                         SIGN, "signs-renovations"))

    # ---- work, food, signs, terrace
    if a["reno"] in ("inside", "facade"):
        ask.append(_item("amber", "Renovation permit before any work",
                         "Work inside the space or on the façade needs a renovation permit, and the borough may require it "
                         "when you apply for the occupancy permit. Never start work before you have it.", RENO,
                         "signs-renovations"))
        lease.append(_item("amber", "Free rent for the build-out, and who pays for what",
                           "Negotiate free-rent months while permits and work are under way, and write down who pays for "
                           "ventilation, electrical and plumbing, plus the landlord's OK for the work.", "", "commercial-lease"))
    elif a["reno"] == "none":
        ask.append(_item("green", "No renovation planned",
                         "Still ask whether the space meets code for your use: some changes of use need work anyway.", OCC))

    if a["food"] in ("products", "prep"):
        kind = "restaurant" if a["food"] == "prep" else "retail"
        ask.append(_item("amber", "MAPAQ %s permit: no sales before it arrives" % kind,
                         "The permit must reach you before you start and be displayed; processing takes 2 to 6 weeks. MAPAQ "
                         "asks you to check with the municipality that a food business is allowed at the address first.",
                         MAPAQ, "food-permits"))
    if a["food"] == "prep":
        lease.append(_item("amber", "Ventilation, grease trap, sinks",
                           "Check the space can take a hood with a path outside, a grease trap and the sinks inspectors "
                           "expect, and who pays for them, before you sign.", "", "food-permits"))

    if a["sign"] == "yes":
        lease.append(_item("amber", "Your right to a sign",
                           "Write down where your sign may go on the building. Keeping the previous business's sign also "
                           "needs a permit in your name, and French must be markedly predominant.", SIGN, "french-rules"))
    if a["terrace"] == "yes":
        lease.append(_item("amber", "The landlord's OK for a terrace",
                           "Terrace rules depend on the borough, your activity and where it is (private land or the "
                           "sidewalk); some also need a café-terrace permit. Get the landlord's consent in the lease.",
                           TERRACE, "signs-renovations"))

    # ---- clauses every lease should have
    lease.insert(0, _item("green" if a["confirmed"] == "written" else "amber", "Make the lease depend on your permits",
                          "A clause that cancels the lease, without penalty, if the borough refuses your occupancy permit "
                          "(and the other permits you need) by a set date.", "", "commercial-lease"))
    lease.insert(1, _item("green", "The permitted use, in your words",
                          "The use written in the lease should match exactly what you will do there.", "", "commercial-lease"))

    # ---- permits, in order: the certificate of occupancy always comes first
    conv = a["reno"] in ("inside", "facade") or a["prev"] in ("other", "home", "empty", "unknown")
    order.append(_item("amber" if conv else "green", "Certificate of occupancy (certificat d'occupation)",
                       ("With your renovation (conversion) permit: the borough may require it first. " if conv else "")
                       + "Every business address needs one, even a home office; the borough contacts you within 14 days "
                       "of applying.", OCC, "occupancy-permit"))
    if a["alcohol"] == "yes":
        order.append(_item("amber", "Alcohol permit (RACJ), after the occupancy permit",
                           "Montréal says a bar or restaurant must have its occupancy permit before applying to the Régie "
                           "des alcools, des courses et des jeux.", RACJ, "food-permits"))
    if a["sign"] == "yes":
        order.append(_item("green", "Sign permit",
                           "Receivable only with a valid occupancy permit or proof you applied for one.", SIGN,
                           "signs-renovations"))
    if a["terrace"] == "yes":
        order.append(_item("green", "Terrace permit", "Seasonal, from the borough; apply before spring.", TERRACE,
                           "signs-renovations"))
    if a["food"] in ("products", "prep"):
        order.append(_item("amber", "MAPAQ food permit", "Before your first sale, displayed where customers can see it.",
                           MAPAQ, "food-permits"))

    every = ask + lease
    worst = max([RANK[i["level"]] for i in every] or [0])
    verdict = None if not answered else ("red" if worst == 2 else "amber" if worst == 1 else "green")
    headline, summary = {
        None: ("Answer the questions", "Nine quick questions. Your answers stay in this browser."),
        "red": ("Don't sign yet", "Settle the red points with the borough first: signing now could leave you paying rent "
                                  "on a space where you can't open."),
        "amber": ("Sign only with conditions", "Nothing blocks you so far, but put the amber points in writing, in the lease "
                                               "or from the borough, before you sign."),
        "green": ("Looks ready", "Keep the borough's confirmation and the permit clause in your lease, and you're set."),
    }[verdict]
    return {"answered": answered, "total": len(KEYS), "verdict": verdict, "headline": headline, "summary": summary,
            "ask": ask, "lease": lease, "order": order}
