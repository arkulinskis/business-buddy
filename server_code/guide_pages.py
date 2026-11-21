"""Crawlable guide pages: /guides (all 30 guides) and /guides/<slug> (one guide as plain HTML).

The app itself runs in the browser at /#guide/<slug>, which search engines skip and chat apps unfurl badly. These
pages carry the same content (permits, costs, the money, tips, pitfalls, roadmap, sources, the check date) as
server-rendered HTML with canonical, Open Graph and JSON-LD tags, work without JavaScript at 390 px, and link
into the app. The content comes from server_code/kb_pages.py, generated from theme/assets/bb.js by
tools/export_kb.py (HTML snippets already cleaned there). Unknown slug -> 404 page. Paths are listed in the sitemap
through APP_MAKER/seo/apps/businessbuddy.json (sitemap_extra).
"""
import html
import json

import anvil
import anvil.server

from .kb_pages import KB

SITE = "https://business-buddy.anvil.app"
E = html.escape
DIFF = ["", "Easy start", "Approachable", "Moderate", "Demanding", "Expert"]
GUIDES = {g["slug"]: g for g in KB["guides"]}
TOPICS = {t["slug"]: t for t in KB["topics"]}
CATS = {c["id"]: c for c in KB["categories"]}


def origin():
    return SITE


# ---------------------------------------------------------------- formatting (same as BB.kmoney / BB.range / BB.weeks)
def _num(x):
    s = ("%.1f" % x).rstrip("0").rstrip(".")
    return s


def kmoney(n):
    n = float(n or 0)
    if n >= 1000:
        f = 10 if n < 10000 else 1
        return "$" + _num(int(n / 1000 * f + 0.5) / f) + "k"
    return "$%d" % int(n + 0.5)


def cost_range(r):
    return kmoney(r[0]) + "–" + kmoney(r[1])


def weeks(w):
    if w[1] <= 8:
        return "%d–%d weeks" % (w[0], w[1])
    return "%d–%d months" % (max(1, int(w[0] / 4.3 + 0.5)), int(w[1] / 4.3 + 0.5))


def money(n):
    return "${:,.0f}".format(n or 0)


def article(name):
    return "an" if name[:1].lower() in "aeiou" else "a"


def page_title(g):
    n = g["name"].lower()
    return "How to open %s %s in Montréal: permits, costs and first steps" % (article(n), n)


# ---------------------------------------------------------------- the page frame
CSS = """
:root{--bg:#fbf6ee;--surface:#fff;--surface2:#f3ebdd;--ink:#1e2430;--muted:#5c6270;--line:#e7dccb;--brand:#c2412d;--brand-ink:#fff;
--brand-soft:#f8e4dd;--accent:#1b6f61;--accent-soft:#dcefe9;--warn-soft:#fbefd6;--stripe:#e8705a;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#15181f;--surface:#1e222b;--surface2:#272c37;--ink:#f2ece2;--muted:#aab0bc;--line:#323846;
--brand:#ec7a63;--brand-ink:#1b0f0b;--brand-soft:#3a241f;--accent:#55c3ad;--accent-soft:#17302b;--warn-soft:#2d2311;--stripe:#c2412d;color-scheme:dark}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;text-size-adjust:100%;accent-color:var(--brand)}
body{margin:0;background:var(--bg);color:var(--ink);font:400 1rem/1.65 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--brand);text-underline-offset:.2em}a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 60%,transparent);outline-offset:2px}
h1,h2,h3{font-family:Fraunces,Georgia,serif;line-height:1.15;letter-spacing:-.01em;text-wrap:balance}
h1{font-size:clamp(1.9rem,6vw,2.7rem);margin:.3em 0 .25em}h2{font-size:1.5rem;margin:2.2em 0 .6em}h3{font-size:1.12rem;margin:1.4em 0 .3em}
p,li{text-wrap:pretty}
.awning{height:14px;background:repeating-linear-gradient(90deg,var(--brand) 0 28px,var(--bg) 28px 56px)} /* design-ok: the brand's awning */
.wrap{max-width:780px;margin:0 auto;padding:0 16px}
.top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 0;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;font:600 1.1rem/1 Fraunces,Georgia,serif;color:var(--ink);text-decoration:none}
.brand img{width:34px;height:34px;border-radius:9px}
.top .sp{flex:1}.top a.nav{color:var(--ink);font-weight:500;font-size:.95rem}
.crumbs{font-size:.9rem;color:var(--muted);margin:22px 0 0}.crumbs a{color:var(--muted)}
.fr{color:var(--muted);font-style:italic;margin:0}.lead{font-size:1.12rem;color:var(--muted);margin:.5em 0 0}
.glance{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:22px 0;padding:0}
.glance div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.glance dt{font-size:.78rem;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}.glance dd{margin:2px 0 0;font-weight:650;font-variant-numeric:tabular-nums}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 4px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 18px;border-radius:10px;border:1px solid var(--line);
background:var(--surface);color:var(--ink);font:600 .97rem/1.2 Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer;
transition:background-color 180ms cubic-bezier(.23,1,.32,1),border-color 180ms cubic-bezier(.23,1,.32,1),transform 140ms cubic-bezier(.23,1,.32,1)}
.btn:hover{border-color:var(--brand)}.btn:active{transform:scale(.97)}
.btn.primary{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}.btn.primary:hover{background:color-mix(in srgb,var(--brand) 88%,#000)}
.note{background:var(--warn-soft);border-radius:10px;padding:12px 14px;font-size:.93rem;margin:16px 0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:10px 0}
.card h3{margin:0 0 2px}.card .who{color:var(--muted);font-size:.93rem;margin:2px 0}.card p{margin:4px 0}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;margin:8px 0 18px;background:var(--surface);border-radius:12px;overflow:hidden}
caption{text-align:left;font-weight:650;padding:6px 0}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th.n,td.n{text-align:right;white-space:nowrap}
thead th{font-size:.82rem;color:var(--muted);font-weight:600}tr.total td{font-weight:700;border-bottom:0}
.safe{background:var(--accent-soft);border-radius:10px;padding:12px 14px}
ul.list{padding-left:1.2em}ul.list li{margin:.35em 0}
ol.road{padding-left:1.3em}ol.road>li{margin:.9em 0}ol.road>li>b{font-family:Fraunces,Georgia,serif;font-size:1.05rem}
ol.road ul{padding-left:1.1em;margin:.3em 0;color:var(--muted)}.star{color:var(--accent);font-weight:600}
.cta{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;margin:34px 0;border-top:8px solid var(--brand)}
.cta h2{margin:0 0 .3em}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0;list-style:none}
.grid li a{display:block;height:100%;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;color:var(--ink);text-decoration:none;
transition:border-color 180ms cubic-bezier(.23,1,.32,1)}
.grid li a:hover{border-color:var(--brand)}.grid b{display:block}.grid small{display:block;color:var(--muted);font-size:.88rem;line-height:1.45}
.grid .meta{color:var(--accent);font-weight:600;font-variant-numeric:tabular-nums}
footer{border-top:1px solid var(--line);margin-top:48px;padding:22px 0 40px;color:var(--muted);font-size:.9rem}footer a{color:var(--muted)}
.status{font-size:.9rem;color:var(--accent);min-height:1.4em;margin:4px 0 0}
@media (max-width:640px){.glance{grid-template-columns:repeat(2,minmax(0,1fr))}.grid{grid-template-columns:1fr}.btn{flex:1 1 auto}
th,td{padding:8px}}
@media (prefers-reduced-motion:reduce){.btn,.grid li a{transition:none}}
@media print{.awning,.top,.actions,.cta,footer{display:none}body{background:#fff;color:#000}}
"""

SHARE_JS = """(function(){var b=document.getElementById('share');if(!b)return;var s=document.getElementById('share-status');b.hidden=false;
b.addEventListener('click',function(){var u=b.getAttribute('data-url'),t=b.getAttribute('data-title');
if(navigator.share){navigator.share({title:t,url:u}).catch(function(){});return;}
function ok(){s.textContent='Link copied: paste it anywhere.';}
function no(){window.prompt('Copy this link',u);}
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(ok,no);}else{no();}});})();"""


def _ld(data):
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/")


def frame(title, desc, path, body, ld, robots="index, follow, max-image-preview:large, max-snippet:-1"):
    o = origin()
    return """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s | Business Buddy</title>
<meta name="description" content="%(desc)s">
<link rel="canonical" href="%(url)s">
<meta name="robots" content="%(robots)s">
<meta name="theme-color" content="#c2412d">
<meta property="og:type" content="article"><meta property="og:site_name" content="Business Buddy">
<meta property="og:title" content="%(title)s"><meta property="og:description" content="%(desc)s">
<meta property="og:url" content="%(url)s"><meta property="og:image" content="%(o)s/_/theme/og-image.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="%(o)s/_/theme/icon-512.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap">
<script type="application/ld+json">%(ld)s</script>
<style>%(css)s</style></head>
<body><div class="awning" aria-hidden="true"></div>
<div class="wrap">
<header class="top"><a class="brand" href="%(o)s/"><img src="%(o)s/_/theme/icon-512.png" alt="" width="34" height="34">Business Buddy</a>
<span class="sp"></span><a class="nav" href="%(o)s/guides">All guides</a><a class="nav" href="%(o)s/#library">Open the app</a></header>
<main>%(body)s</main>
<footer><p>Business Buddy is a free guide to opening a one- or two-person business in Montréal, made by
<a href="https://arkvital.com">Arkvital</a> in Montréal. General information, not legal or tax advice: confirm with the official source
before you pay or sign. <a href="%(o)s/guides">All guides</a> · <a href="%(o)s/about">About</a> · <a href="%(o)s/">Open the app</a></p>
<p>Contact developer: <a href="https://arkvital.com">arkvital.com</a> · Parent company: <a href="https://addanapp.com">addanapp.com</a></p></footer>
</div><script>%(js)s</script></body></html>
""" % {"title": E(title), "desc": E(desc), "url": E(o + path), "robots": robots, "o": E(o), "ld": _ld(ld), "css": CSS,
       "body": body, "js": SHARE_JS}


def _crumbs(o, items):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": o + p} for i, (n, p) in enumerate(items)]}


def _share_button(url, title):
    return ('<button class="btn" id="share" type="button" hidden data-url="%s" data-title="%s">Share this guide</button>'
            % (E(url), E(title)))


# ---------------------------------------------------------------- one guide
def guide_html(g):
    o = origin()
    slug, name = g["slug"], g["name"]
    cat = CATS.get(g["cat"]) or {"name": "Guides", "id": ""}
    gl = g["glance"]
    path = "/guides/" + slug
    title = page_title(g)
    desc = ("%s in Montréal: the permits (%s), startup costs of %s, time to open, the money maths, tips and pitfalls, "
            "with official sources. Checked %s." % (name, ", ".join(KB["permits"][p]["name"] for p in g["permits"][:3]
                                                                     if p in KB["permits"]), cost_range(gl["cost"]), KB["updated"]))
    once = [c for c in g.get("costs") or [] if c[3] != "monthly"]
    monthly = [c for c in g.get("costs") or [] if c[3] == "monthly"]
    t_once = [sum(c[1] for c in once), sum(c[2] for c in once)]
    t_month = [sum(c[1] for c in monthly), sum(c[2] for c in monthly)]
    b = []
    b.append('<nav class="crumbs" aria-label="Breadcrumb"><a href="%s/guides">Guides</a> › <a href="%s/guides#%s">%s</a></nav>'
             % (E(o), E(o), E(cat["id"]), E(cat["name"])))
    b.append("<h1>%s</h1>" % E(title))
    b.append('<p class="fr" lang="fr">%s</p><p class="lead">%s</p>' % (E(g.get("fr") or ""), E(g.get("tagline") or "")))
    b.append('<dl class="glance"><div><dt>Startup cost</dt><dd>%s</dd></div><div><dt>Time to open</dt><dd>%s</dd></div>'
             '<div><dt>Difficulty</dt><dd>%s (%d/5)</dd></div><div><dt>At home?</dt><dd>%s</dd></div></dl>'
             % (cost_range(gl["cost"]), weeks(gl["weeks"]), DIFF[gl["difficulty"]] if 0 < gl["difficulty"] < 6 else "",
                gl["difficulty"], "Possible" if gl.get("home") else "Needs premises"))
    b.append('<div class="actions"><a class="btn primary" href="%s/#guide/%s">Open the interactive guide</a>'
             '<a class="btn" href="%s/#plan/new/%s">Start a free launch plan</a>%s</div>'
             '<p class="status" id="share-status" role="status" aria-live="polite"></p>'
             % (E(o), E(slug), E(o), E(slug), _share_button(o + path, title)))
    b.append('<h2 id="overview">Overview</h2>%s' % g.get("intro", ""))
    b.append('<p class="note">Checked in %s. Fees and rules change every year and can differ by borough: confirm with the '
             'official source before you pay or sign. This is general information, not legal or tax advice.</p>' % E(KB["updated"]))
    # permits
    b.append('<h2 id="permits">Permits you\'ll need</h2><p>The registrations and licences that usually apply. Your exact list depends '
             'on your address and setup: the <a href="%s/#tools/finder">permit finder</a> and the '
             '<a href="%s/#tools/lease">before-you-sign-the-lease check</a> help.</p>' % (E(o), E(o)))
    for pid in g["permits"]:
        p = KB["permits"].get(pid)
        if not p:
            continue
        link = ' <a href="%s" rel="noopener">Official page</a>' % E(p["url"]) if p.get("url") else ""
        b.append('<div class="card"><h3>%s</h3><p class="fr" lang="fr">%s</p><p class="who">%s · %s</p><p>When: %s.%s</p></div>'
                 % (E(p["name"]), E(p.get("fr") or ""), E(p["who"]), E(p["cost"]), E(p["when"]), link))
    # rules
    if g.get("rules"):
        b.append('<h2 id="rules">What\'s special about this business</h2>')
        for head, body in g["rules"]:
            b.append("<h3>%s</h3>%s" % (E(head), body))
    # costs
    b.append('<h2 id="costs">Startup costs</h2><p>Rough Montréal ranges for a 1–2 person business, before taxes.</p>')
    for caption, rows, tot, label in (("One-time costs", once, t_once, "Total"), ("Monthly costs", monthly, t_month, "Total per month")):
        if not rows:
            continue
        trs = "".join('<tr><td>%s</td><td class="n">%s</td><td class="n">%s</td></tr>' % (E(c[0]), money(c[1]), money(c[2])) for c in rows)
        b.append('<table><caption>%s</caption><thead><tr><th scope="col">Item</th><th scope="col" class="n">Low</th>'
                 '<th scope="col" class="n">High</th></tr></thead><tbody>%s<tr class="total"><td>%s</td><td class="n">%s</td>'
                 '<td class="n">%s</td></tr></tbody></table>' % (caption, trs, label, money(tot[0]), money(tot[1])))
    b.append('<p class="safe">To open safely, have the one-time costs <b>plus about 6 months of monthly costs</b> and a 15%% cushion: '
             'roughly <b>%s to %s</b>.</p>' % (money((t_once[0] + 6 * t_month[0]) * 1.15), money((t_once[1] + 6 * t_month[1]) * 1.15)))
    if g.get("money"):
        b.append('<h2 id="money">The money</h2>%s' % g["money"])
    for hid, head, key in (("tips", "Tips to start right", "tips"), ("deeper", "Going deeper (advanced)", "pro"),
                           ("pitfalls", "Common pitfalls", "pitfalls")):
        if g.get(key):
            b.append('<h2 id="%s">%s</h2><ul class="list">%s</ul>' % (hid, head, "".join("<li>%s</li>" % E(t) for t in g[key])))
    # roadmap
    road = []
    for ph in g.get("roadmap") or []:
        tasks = "".join("<li>%s%s</li>" % (E(t["t"]), ' <span class="star">(%s)</span>' % E(name.lower()) if t.get("special") else "")
                        for t in ph["tasks"])
        road.append("<li><b>%s</b><br>%s<ul>%s</ul></li>" % (E(ph["name"]), E(ph.get("blurb") or ""), tasks))
    if road:
        b.append('<h2 id="roadmap">Your roadmap, step by step</h2><ol class="road">%s</ol>' % "".join(road))
    b.append('<section class="cta"><h2>Turn this into your own checklist</h2><p>Tick off each step, keep notes, track your startup '
             'budget and your opening date. Free, and private to you.</p><div class="actions"><a class="btn primary" '
             'href="%s/#plan/new/%s">Start my %s plan</a><a class="btn" href="%s/#guide/%s">Open the interactive guide</a></div></section>'
             % (E(o), E(slug), E(name.lower()), E(o), E(slug)))
    # sources
    links = list(g.get("links") or []) + [["BizPaL: permits for your activity and address", "https://bizpal-perle.ca/"],
                                          ["Montréal: open a business or launch a company", "https://montreal.ca/en/articles/open-business-or-launch-company-18507"]]
    b.append('<h2 id="sources">Official sources</h2><ul class="list">%s</ul>'
             % "".join('<li><a href="%s" rel="noopener">%s</a></li>' % (E(u), E(t)) for t, u in links))
    topics = [TOPICS[s] for s in g.get("topics") or [] if s in TOPICS]
    if topics:
        b.append('<h2>Read next in the Basics</h2><ul class="grid">%s</ul>' % "".join(
            '<li><a href="%s/#topic/%s"><b>%s</b><small>%s</small></a></li>' % (E(o), E(t["slug"]), E(t["title"]), E(t.get("summary") or ""))
            for t in topics))
    more = [x for x in KB["guides"] if x["cat"] == g["cat"] and x["slug"] != slug]
    if more:
        b.append('<h2>More %s guides</h2><ul class="grid">%s</ul>' % (E(cat["name"].lower()), "".join(_card(o, x) for x in more)))
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "Article", "@id": o + path + "#article", "headline": title, "description": desc, "url": o + path,
         "inLanguage": "en", "about": "Opening %s %s in Montréal, Québec" % (article(name), name.lower()),
         "image": o + "/_/theme/og-image.png", "isAccessibleForFree": True,
         "author": {"@id": "https://arkvital.com/#org"}, "publisher": {"@id": "https://arkvital.com/#org"},
         "isPartOf": {"@id": o + "/#site"}, "mainEntityOfPage": o + path},
        _crumbs(o, [("Business Buddy", "/"), ("Guides", "/guides"), (name, path)]),
        {"@type": "WebSite", "@id": o + "/#site", "url": o + "/", "name": "Business Buddy"},
        {"@type": "Organization", "@id": "https://arkvital.com/#org", "name": "Arkvital", "url": "https://arkvital.com"}]}
    return frame(title, desc, path, "".join(b), ld)


def _card(o, g):
    return ('<li><a href="%s/guides/%s"><b>%s</b><small>%s</small><small class="meta">%s · %s</small></a></li>'
            % (E(o), E(g["slug"]), E(g["name"]), E(g.get("tagline") or ""), cost_range(g["glance"]["cost"]), weeks(g["glance"]["weeks"])))


# ---------------------------------------------------------------- the list
def index_html():
    o = origin()
    title = "How to open a small business in Montréal: %d guides" % len(KB["guides"])
    desc = ("Free guides to opening a one- or two-person business in Montréal: permits, startup costs, time to open and "
            "first steps for %d kinds of business, from bakeries and barbers to cleaning and trades. Checked %s."
            % (len(KB["guides"]), KB["updated"]))
    b = ['<nav class="crumbs" aria-label="Breadcrumb"><a href="%s/">Business Buddy</a> › Guides</nav>' % E(o),
         "<h1>%s</h1>" % E(title),
         '<p class="lead">Pick your business: each guide lists the permits in the order you need them, real Montréal costs, '
         'the money maths, tips and pitfalls, with links to the official pages. Checked in %s.</p>' % E(KB["updated"]),
         '<div class="actions"><a class="btn primary" href="%s/#library">Search the guides in the app</a>'
         '<a class="btn" href="%s/#tools/lease">Before you sign a lease</a></div>' % (E(o), E(o))]
    for c in KB["categories"]:
        gs = [g for g in KB["guides"] if g["cat"] == c["id"]]
        if gs:
            b.append('<h2 id="%s">%s</h2><p>%s</p><ul class="grid">%s</ul>' % (E(c["id"]), E(c["name"]), E(c.get("blurb") or ""),
                                                                               "".join(_card(o, g) for g in gs)))
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "@id": o + "/guides#page", "url": o + "/guides", "name": title, "description": desc,
         "isPartOf": {"@id": o + "/#site"}, "mainEntity": {"@type": "ItemList", "itemListElement": [
             {"@type": "ListItem", "position": i + 1, "url": o + "/guides/" + g["slug"], "name": g["name"]}
             for i, g in enumerate(KB["guides"])]}},
        _crumbs(o, [("Business Buddy", "/"), ("Guides", "/guides")]),
        {"@type": "WebSite", "@id": o + "/#site", "url": o + "/", "name": "Business Buddy"}]}
    return frame(title, desc, "/guides", "".join(b), ld)


def missing_html():
    o = origin()
    body = ('<h1>We don\'t have that guide</h1><p class="lead">It may have moved. Here are all the guides.</p>'
            '<div class="actions"><a class="btn primary" href="%s/guides">All guides</a></div>' % E(o))
    return frame("Guide not found", "This guide doesn't exist.", "/guides", body,
                 {"@context": "https://schema.org", "@type": "WebPage", "name": "Guide not found"}, robots="noindex")


def _page(status, text):
    return anvil.server.HttpResponse(status, anvil.BlobMedia("text/html; charset=utf-8", text.encode("utf-8")),
                                     headers={"Cache-Control": "public, max-age=3600"})


def serve_index():
    return _page(200, index_html())


def serve_guide(slug):
    g = GUIDES.get((slug or "").strip().lower())
    return _page(200, guide_html(g)) if g else _page(404, missing_html())


# @anvil.server.route serves at the domain root on the Python 3.10+ runtimes (this app runs python314). The local
# open-source App Server may lack it: then the same pages answer at /_/api/guides (testing only; canonical stays /guides).
ROUTE = getattr(anvil.server, "route", None) or anvil.server.http_endpoint


@ROUTE("/guides")
def guides_index(**params):
    return serve_index()


@ROUTE("/guides/:slug")
def guide_page(slug, **params):
    return serve_guide(slug)
