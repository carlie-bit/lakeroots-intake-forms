# Lake Roots — Forms

Standalone site for Lake Roots' public intake forms. Lives apart from the
dashboards repo so the forms chats and the dashboard chats can never collide.

## What's here
- `templates/` — the form pages + landing, plus `style.css` (brand CSS with font tokens)
- `assets/` — brand fonts + logo (embedded as base64 at build time)
- `build_forms.py` — builds `web/` from the templates (stdlib only, no install)
- `web/` — the published output (Netlify serves this)
- `netlify.toml` — build + publish config

## Forms
| Page | Writes to (Supabase) |
|------|----------------------|
| `feedback.html` | `feedback_submissions`, `feedback_contacts` |
| `partner.html`  | `outreach_submissions`, `outreach_contacts` |

Submissions go straight to Supabase from the browser using the public
publishable (anon) key — so data is live instantly. You only rebuild/redeploy
when a form's **layout** changes.

## Edit a form
1. Edit the page in `templates/` (or `style.css` for brand-wide look).
2. `python3 build_forms.py`
3. Commit + push — Netlify auto-deploys.

## Add a form
1. Add `templates/<name>_form.html` (copy an existing one; set its own Supabase
   table). Add a card to `templates/index.html`.
2. Register it in `PAGES` in `build_forms.py`.
3. Build, commit, push.

## One-time setup (turning this folder into its own site)
1. Move this `forms-site/` folder out to its own location and `git init`.
2. Create a new GitHub repo (e.g. `lakeroots-forms`) and push to it.
3. In Netlify: New site → import that repo → it reads `netlify.toml` and deploys.
4. Point the hub's Forms links at the new site URL.

Brand assets are duplicated here for self-containment; if we later add a shared
brand snippet, this folder adopts it without changing the forms themselves.
