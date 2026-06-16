// Sends a branded "thanks for reaching out" confirmation + summary to the person
// who submitted the Community Outreach / partnership form.
//
// Invoked by an AFTER INSERT trigger on public.outreach_contacts (via pg_net),
// which passes {submission_id}. The function looks up the contact email + the
// submission itself with the service role, so it can only ever email an address
// already on file for a real submission (no arbitrary sends). verify_jwt is off
// because the trigger is internal and carries no JWT; the DB lookup is the guard.
//
// Required secret: RESEND_API_KEY. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
// provided to edge functions automatically.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "Lake Roots <hello@lakerootscl.com>";
const LOGO = "https://lakeroots-intake-forms.netlify.app/lr-logo.png";
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

function buildEmail(name: string, s: Record<string, unknown>): string {
  const rows: [string, unknown][] = [
    ["What you're reaching out about", s.inquiry_type],
    ["Organization", s.org],
    ["Proposed / needed-by date", s.proposed_date],
    ["Details", s.donation_details || s.event_desc || s.market_products || s.brief_desc || s.donation_purpose || s.other_notes],
  ];
  const summary = rows.filter(([, v]) => v).map(([l, v]) =>
    `<tr><td style="padding:7px 16px 7px 0;color:#717F7F;font-size:12px;text-transform:uppercase;letter-spacing:.6px;vertical-align:top;white-space:nowrap">${esc(l)}</td><td style="padding:7px 0;color:#2B3026;font-size:14px;vertical-align:top">${esc(v)}</td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#FCFBE4;padding:0">
  <div style="max-width:564px;margin:0 auto;padding:30px 24px 34px;font-family:'Helvetica Neue',Arial,sans-serif;color:#2B3026">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:26px"><tr>
      <td style="vertical-align:middle"><img src="${LOGO}" width="50" height="64" alt="Lake Roots" style="display:block;border:0"></td>
      <td style="vertical-align:middle;padding-left:14px">
        <div style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;letter-spacing:3px;font-size:21px;color:#363A2E;line-height:1.05">LAKE ROOTS</div>
        <div style="font-size:10.5px;letter-spacing:2.5px;text-transform:uppercase;color:#717F7F;margin-top:5px">Café &middot; Market &middot; Bar</div>
      </td>
    </tr></table>
    <p style="font-size:16px;line-height:1.55;margin:0 0 14px">Hi ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.62;margin:0 0 18px">Thanks for reaching out to Lake Roots! We've received your inquiry and it's in our review queue. We look at every request as a team, and someone will be in touch shortly &mdash; usually within a week or two.</p>
    <div style="background:#ffffff;border:1px solid #DCD8BE;border-radius:12px;padding:16px 18px;margin:0 0 20px">
      <div style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:#363A2E;font-weight:bold;margin-bottom:10px">Here's what you sent us</div>
      <table style="width:100%;border-collapse:collapse">${summary || `<tr><td style="color:#717F7F;font-size:13px">We have your inquiry on file.</td></tr>`}</table>
    </div>
    <p style="font-size:14px;line-height:1.6;color:#4F5854;margin:0">If anything above looks off, just reply to this email and let us know.</p>
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
      `${SUPABASE_URL}/rest/v1/outreach_contacts?submission_id=eq.${subId}&select=first_name,email`,
      { headers: H },
    )).json())?.[0] as { first_name?: string; email?: string } | undefined;
    if (!c?.email) return Response.json({ skipped: "no contact email on file" });

    const s = ((await (await fetch(
      `${SUPABASE_URL}/rest/v1/outreach_submissions?id=eq.${subId}&select=*`,
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
        subject: "Thanks for reaching out to Lake Roots",
        html: buildEmail(String(c.first_name ?? "").trim() || "there", s),
      }),
    });
    const out = await send.json().catch(() => ({}));
    return Response.json({ ok: send.ok, resend: out }, { status: send.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ error: String(e) });
  }
});
