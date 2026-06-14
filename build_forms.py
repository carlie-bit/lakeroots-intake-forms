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

Reads:
  templates/*.html   (form pages + landing, with __CSS__ / __LOGO__ tokens)
  templates/style.css(shared brand CSS, with __FONT_*__ tokens)
  assets/*           (brand fonts + logo, embedded as base64)

Writes:
  web/*.html         (publish folder for Netlify)

Run:  python3 build_forms.py
"""
import os, base64

ROOT = os.path.dirname(os.path.abspath(__file__))
TPL = os.path.join(ROOT, "templates")
ASSETS = os.path.join(ROOT, "assets")
WEB = os.path.join(ROOT, "web")

# template file -> published filename
PAGES = [
    ("index.html",        "index.html"),     # landing / forms directory
    ("feedback_form.html","feedback.html"),  # guest feedback intake
    ("partner_form.html", "partner.html"),   # community partnership intake
]

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

    for tpl_name, out_name in PAGES:
        path = os.path.join(TPL, tpl_name)
        if not os.path.exists(path):
            print(f"  ! missing template {tpl_name} — skipping {out_name}")
            continue
        html = open(path).read()
        html = html.replace("__CSS__", css).replace("__LOGO__", logo)
        # forms don't use these, but replace defensively so no token leaks through
        html = html.replace("__PROXY__", "").replace("__DATA__", "null")
        open(os.path.join(WEB, out_name), "w").write(html)
        print(f"  {out_name:16s} <- templates/{tpl_name}  ({len(html)//1024} KB)")

    # keep the forms out of search engines (same as the dashboards)
    open(os.path.join(WEB, "_headers"), "w").write("/*\n  X-Robots-Tag: noindex, nofollow\n")
    open(os.path.join(WEB, "robots.txt"), "w").write("User-agent: *\nDisallow: /\n")
    print(f"  site ready -> {WEB}")

if __name__ == "__main__":
    main()
