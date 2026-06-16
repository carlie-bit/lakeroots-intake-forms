// Sends a branded "thanks for your vendor inquiry" confirmation + summary to the
// person who submitted the Market Vendor form.
//
// Invoked by an AFTER INSERT trigger on public.vendor_contacts (via pg_net),
// which passes {submission_id}. Looks up the contact email + the submission with
// the service role, so it can only email an address already on file. verify_jwt
// is off (internal trigger, no JWT); the DB lookup is the guard.
//
// Required secret: RESEND_API_KEY (already set for outreach-confirmation).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "Lake Roots <hello@lakerootscl.com>";
const LOGO = "https://lakeroots-intake-forms.netlify.app/lr-email-logo.png";
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

function buildEmail(name: string, s: Record<string, unknown>): string {
  const rows: [string, unknown][] = [
    ["Business", s.dba || s.legal_name],
    ["Product category", s.product_category],
    ["Products", s.product_desc],
    ["Food / beverage products", s.offers_food ? "Yes" : ""],
  ];
  const summary = rows.filter(([, v]) => v).map(([l, v]) =>
    `<tr><td style="padding:7px 16px 7px 0;color:#717F7F;font-size:12px;text-transform:uppercase;letter-spacing:.6px;vertical-align:top;white-space:nowrap">${esc(l)}</td><td style="padding:7px 0;color:#2B3026;font-size:14px;vertical-align:top">${esc(v)}</td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#FCFBE4;padding:0">
  <div style="max-width:564px;margin:0 auto;padding:30px 24px 34px;font-family:'Helvetica Neue',Arial,sans-serif;color:#2B3026">
    <div style="text-align:center;margin-bottom:26px"><img src="${LOGO}" width="208" height="179" alt="Lake Roots — Café · Market · Bar" style="display:inline-block;border:0"></div>
    <p style="font-size:16px;line-height:1.55;margin:0 0 14px">Hi ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.62;margin:0 0 18px">Thanks for your interest in becoming a Lake Roots vendor &mdash; whether that's selling your products in our market or being a trusted café, food, or bar partner! We've received your inquiry and it's in our review queue. We look at every vendor as a team, and someone will be in touch shortly &mdash; usually within a week or two.</p>
    <div style="background:#ffffff;border:1px solid #DCD8BE;border-radius:12px;padding:16px 18px;margin:0 0 20px">
      <div style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:#363A2E;font-weight:bold;margin-bottom:10px">Here's what you sent us</div>
      <table style="width:100%;border-collapse:collapse">${summary || `<tr><td style="color:#717F7F;font-size:13px">We have your inquiry on file.</td></tr>`}</table>
    </div>
    <p style="font-size:14px;line-height:1.6;color:#4F5854;margin:0">If you have insurance or product documents to send and didn't attach them, just reply to this email.</p>
    <div style="border-top:1px solid #DCD8BE;margin-top:24px;padding-top:16px">
      <div style="font-family:Georgia,serif;font-style:italic;color:#B68036;font-size:17px">rooted in community</div>
      <div style="color:#9aa39a;font-size:11px;margin-top:6px">Lake Roots Café Market Bar &middot; Crystal Lake</div>
    </div>
  </div></body></html>`;
}

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const subId = (body?.submission_id ?? (body?.record as Record<string, unknown>)?.submission_id) as string | undefined;
    if (!subId) return Response.json({ skipped: "no submission_id" });

    const c = (await (await fetch(
      `${SUPABASE_URL}/rest/v1/vendor_contacts?submission_id=eq.${subId}&select=first_name,email`,
      { headers: H },
    )).json())?.[0] as { first_name?: string; email?: string } | undefined;
    if (!c?.email) return Response.json({ skipped: "no contact email on file" });

    const s = ((await (await fetch(
      `${SUPABASE_URL}/rest/v1/vendor_submissions?id=eq.${subId}&select=dba,legal_name,product_category,product_desc,offers_food,source`,
      { headers: H },
    )).json())?.[0] ?? {}) as Record<string, unknown>;
    if (s.source && s.source !== "web") return Response.json({ skipped: "non-web source" });

    if (!RESEND_API_KEY) return Response.json({ skipped: "RESEND_API_KEY not set" });
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [c.email],
        subject: "Thanks for your Lake Roots vendor inquiry",
        html: buildEmail(String(c.first_name ?? "").trim() || "there", s),
      }),
    });
    const out = await send.json().catch(() => ({}));
    return Response.json({ ok: send.ok, resend: out }, { status: send.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ error: String(e) });
  }
});
