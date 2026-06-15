#!/usr/bin/env python3
"""
Lake Roots — Forms site builder (STANDALONE).

This folder is self-contained: it has its own templates, brand assets, and this
build script. It does NOT depend on the market-bar-reports dashboards in any
way — that's the whole point of splitting forms out so two chats can never
collide. Lift this folder into its own Git repo + Netlify site and it just runs.

Each form is a branded HTML page that writes straight to Supabase (the keys live
inside each template), so submissions are live instantly — no rebuild needed for
data, only for layout changes.

Review dashboards live here too (next to the forms they read). A dashboard reads
its submissions live from Supabase using the same public publishable key, and
falls back to a baked, de-identified snapshot (data/*.json) when the browser
can't reach Supabase. Contact info (names/emails/phones) lives in a separate
table and only loads when a teammate clicks "View contact info" — it is never
baked into the page.

Reads:
  templates/*.html   (form pages + landing + dashboards, with __CSS__ / __LOGO__
                      / __PROXY__ / __DATA__ tokens)
  templates/style.css(shared brand CSS, with __FONT_*__ tokens)
  assets/*           (brand fonts + logo, embedded as base64)
  data/*.json        (de-identified snapshot fallbacks for dashboards)

Writes:
  web/*.html         (publish folder for Netlify)

Run:  python3 build_forms.py
"""
import os, base64

ROOT = os.path.dirname(os.path.abspath(__file__))
TPL = os.path.join(ROOT, "templates")
ASSETS = os.path.join(ROOT, "assets")
DATA = os.path.join(ROOT, "data")
WEB = os.path.join(ROOT, "web")

# template file -> published filename -> baked snapshot (None = form, no data)
PAGES = [
    ("index.html",         "index.html",            None),  # landing / forms directory
    ("feedback_form.html", "feedback.html",         None),  # guest feedback intake
    ("partner_form.html",  "partner.html",          None),  # community partnership intake
    # Review dashboards — live from Supabase, de-identified snapshot fallback.
    ("music_dashboard.html",   "artists-live-music.html",  "music_deid.json"),
    ("outreach_dashboard.html","community-outreach.html",  "outreach_deid.json"),
    # Donation Fulfillment Board — self-contained (own inline CSS/logo), live-only
    # from the `donations` table, no PII. Fed by the outreach page's "Commitment made".
    ("donation_board.html",    "donations.html",           None),
]

# Persistent corner shortcuts stamped into every page (forms + dashboards): a
# "Forms" link back to this site's landing and a "Command Center" link to the
# hub, so the team can always get home from anywhere. Self-contained inline
# styles (no dependency on each page's CSS), brand colors hardcoded so they look
# right whether the page uses the shared brand vars or its own.
HUB_URL = "https://lrcommandcenter.netlify.app/"
FORMS_HOME = "/"  # the Lake Roots Forms landing on this site

_PILL = ("display:inline-flex;align-items:center;gap:7px;text-decoration:none;"
    "font-family:'Oswald','Barlow Condensed',system-ui,sans-serif;text-transform:uppercase;"
    "letter-spacing:.6px;font-size:12px;line-height:1;padding:10px 15px;border-radius:999px;"
    "box-shadow:0 4px 14px rgba(43,48,38,.30)")

def corner_nav(out_name):
    """Lower-right shortcut cluster: Forms home (skipped on the landing) + Command Center."""
    pills = []
    if out_name != "index.html":
        pills.append(
            '<a href="' + FORMS_HOME + '" aria-label="Lake Roots Forms home" '
            'style="' + _PILL + ';background:#fff;color:#363A2E;border:1.5px solid #363A2E">'
            '\U0001F4DD Forms</a>')
    pills.append(
        '<a href="' + HUB_URL + '" aria-label="Back to the Lake Roots Command Center" '
        'style="' + _PILL + ';background:#363A2E;color:#F4F1E4;border:1.5px solid #363A2E">'
        '⌂ Command Center</a>')
    return ('<div style="position:fixed;right:14px;bottom:14px;z-index:99999;display:flex;'
            'gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">'
            + ''.join(pills) + '</div>')

def inject_hub_link(html, out_name):
    """Insert the floating corner shortcuts just before the closing </body>."""
    i = html.rfind("</body>")
    return html if i == -1 else html[:i] + "  " + corner_nav(out_name) + "\n" + html[i:]

def b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def main():
    os.makedirs(WEB, exist_ok=True)
    css = open(os.path.join(TPL, "style.css")).read()
    css = css.replace("__FONT_TAY__", b64(os.path.join(ASSETS, "TAYBenditos.otf")))
    css = css.replace("__FONT_HWY__", b64(os.path.join(ASSETS, "Highway Gothic Narrow.ttf")))
    css = css.replace("__FONT_RED__", b64(os.path.join(ASSETS, "RedondoAve-Regular.ttf")))
    logo = b64(os.path.join(ASSETS, "lr_monogram.png"))

    for tpl_name, out_name, data_name in PAGES:
        path = os.path.join(TPL, tpl_name)
        if not os.path.exists(path):
            print(f"  ! missing template {tpl_name} — skipping {out_name}")
            continue
        # Dashboards bake in a de-identified snapshot as a fallback; forms use
        # "null" so no token leaks through (they pull/push live, no baked data).
        data = "null"
        if data_name is not None:
            data_path = os.path.join(DATA, data_name)
            if not os.path.exists(data_path):
                print(f"  ! missing snapshot {data_name} — skipping {out_name}")
                continue
            data = open(data_path).read()
        html = open(path).read()
        html = html.replace("__CSS__", css).replace("__LOGO__", logo)
        # PROXY stays empty (no Apps Script proxy); DATA is the baked snapshot or null.
        html = html.replace("__PROXY__", "").replace("__DATA__", data)
        html = inject_hub_link(html, out_name)
        open(os.path.join(WEB, out_name), "w").write(html)
        print(f"  {out_name:24s} <- templates/{tpl_name}  ({len(html)//1024} KB)")

    # keep the forms out of search engines (same as the dashboards)
    open(os.path.join(WEB, "_headers"), "w").write("/*\n  X-Robots-Tag: noindex, nofollow\n")
    open(os.path.join(WEB, "robots.txt"), "w").write("User-agent: *\nDisallow: /\n")

    # Friendly aliases for legacy / short URLs so old bookmarks don't 404.
    # The Community Outreach dashboard moved off the hub (where it was
    # outreach.html) and lives here as community-outreach.html — alias the old
    # short name to it on this domain too.
    open(os.path.join(WEB, "_redirects"), "w").write(
        "# <old/short path>  <destination>  <status>\n"
        "/outreach.html   /community-outreach.html   301\n"
    )
    print(f"  site ready -> {WEB}")

if __name__ == "__main__":
    main()
