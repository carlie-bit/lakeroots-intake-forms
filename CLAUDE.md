# CLAUDE.md — Lake Roots Intake Forms

## What this is
Lake Roots' single home for **all intake forms and their review/submission
dashboards**. Every page is Supabase-backed and the site deploys to its own
Netlify site, separate from the analytics repo.

## Scope — what lives here vs. not
- **Here:** intake forms *and* the review dashboards that read those forms'
  submissions. A form and the screen that reviews it live together.
- **Not here:** the Toast/MarginEdge analytics — Sales, Market, Margin, Menu,
  Comp Intel. Those belong to the **`market-bar-reports`** repo.
- **The rule:** Supabase-backed → this repo. Toast/MarginEdge-backed →
  `market-bar-reports`.

## How it works
Each page is branded HTML that **reads/writes Supabase directly** from the
browser, using the **publishable (anon) key baked inline**. Data is therefore
**live instantly** — you only rebuild when a page's **layout** changes, never to
move data.

Build pipeline:
```
python3 build_forms.py     # templates/ + assets/ + data/  ->  web/
git commit + push          # Netlify auto-deploys web/
```
- `build_forms.py` — stdlib-only builder. Inlines `style.css` and base64 fonts/
  logo, bakes a de-identified snapshot (`data/*.json`) into dashboards as an
  offline fallback, and writes `web/`. Pages are registered in its `PAGES` list.
- `templates/` — source HTML (forms, landing `index.html`, dashboards) +
  `style.css`. **Edit here.**
- `assets/` — brand fonts + logo, embedded at build time.
- `data/` — de-identified snapshot fallbacks for dashboards (`*_deid.json`).
- `web/` — **generated** publish folder Netlify serves. Do not hand-edit.
- `netlify.toml` — build (`python3 build_forms.py`) + publish (`web`) config.

## Critical rules
1. **Anon key only.** Only the **publishable/anon** Supabase key may ship in a
   page. **Never** put a service-role key in a template, `web/`, or `data/`.
2. **Each form/dashboard keeps its own Supabase table + keys.** When moving a
   dashboard in from another repo, **keep its exact backend** (table names, key,
   RPCs) so data continuity holds — don't repoint it to a new table.
3. **Privacy gate is mandatory.** This site is public-facing. Any review
   dashboard showing submission data MUST keep its privacy gate — read only
   de-identified rows by default, and load PII (names/emails/phones) on demand
   only behind a manager login / "View contact info" action, never baked into
   the page. Dashboards are `noindex` and reached by direct URL.

## Landing page (`templates/index.html`)
Grouped by audience:
- **External** — guest / community / vendor forms.
- **Internal** — staff forms and the review dashboards.
It also links out to forms hosted elsewhere (Google Forms, the SOP site).

## Conventions
- **Never hand-edit `web/`** — it's generated. Edit `templates/` (or `style.css`
  for brand-wide changes), then rebuild.
- **One session owns this repo at a time** (forms vs. dashboards chats must not
  collide).
- **`git pull --rebase` before push.**

## In progress
Review dashboards are migrating in from `market-bar-reports` and the SOP site
(incident, service-provider). Keep each one's **same Supabase backend** as it
moves; **repoint their links last**, after the page is verified live here.
