// Service / Maintenance report: alert the managers when a new report is logged.
// Invoked by an AFTER INSERT trigger on public.service_reports (via pg_net),
// only for web submissions. No submitter confirmation — this is an internal log.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "Lake Roots <hello@lakerootscl.com>";
// Managers notified on each new service report. Edit this list to add/remove
// recipients (kept in code, not the hello@ distro, per the maintenance owners).
const MANAGERS = [
  "carlie@lakerootscl.com",
  "rod@lakerootscl.com",
  "andy@lakerootscl.com",
  "mike@lakerootscl.com",
  "jj@lakerootscl.com",
  "cuahutli@lakerootscl.com",
];
const DASH = "https://lakeroots-intake-forms.netlify.app/service-review.html";
const LOGO = "https://lakeroots-intake-forms.netlify.app/lr-email-logo.png";
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

function summaryRows(s: Record<string, unknown>): string {
  const rows: [string, unknown][] = [
    ["Date", s.service_date],
    ["Area", s.area],
    ["Equipment", s.equipment],
    ["Type", s.visit_type],
    ["Warranty", s.visit_type === "Repair" ? s.warranty : ""],
    ["Provider", s.provider],
    ["Technician", s.technician],
    ["Resolution", s.resolution],
    ["Description", s.description],
    ["Other details", s.other_details],
  ];
  return rows.filter(([, v]) => v).map(([l, v]) =>
    `<tr><td style="padding:7px 16px 7px 0;color:#717F7F;font-size:12px;text-transform:uppercase;letter-spacing:.6px;vertical-align:top;white-space:nowrap">${esc(l)}</td><td style="padding:7px 0;color:#2B3026;font-size:14px;vertical-align:top">${esc(v)}</td></tr>`).join("");
}

function buildEmail(s: Record<string, unknown>): string {
  const link = s.report_link
    ? `<p style="font-size:13px;margin:2px 0 0"><b style="color:#363A2E">Report / photos:</b> <a href="${esc(s.report_link)}" style="color:#363A2E">${esc(s.report_link)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#FCFBE4;padding:0">
  <div style="max-width:564px;margin:0 auto;padding:28px 24px 32px;font-family:'Helvetica Neue',Arial,sans-serif;color:#2B3026">
    <div style="text-align:center;margin-bottom:22px"><img src="${LOGO}" width="180" height="155" alt="Lake Roots — Café · Market · Bar" style="display:inline-block;border:0"></div>
    <p style="font-size:15px;line-height:1.55;margin:0 0 16px">A new <b>service / maintenance report</b> was just logged.</p>
    <div style="background:#ffffff;border:1px solid #DCD8BE;border-radius:12px;padding:16px 18px;margin:0 0 18px">
      <table style="width:100%;border-collapse:collapse">${summaryRows(s)}</table>
    </div>
    ${link}
    <p style="font-size:14px;line-height:1.6;margin:14px 0 0"><a href="${DASH}" style="color:#363A2E;font-weight:bold">Open the Service &amp; Maintenance board →</a></p>
    <div style="border-top:1px solid #DCD8BE;margin-top:22px;padding-top:14px">
      <div style="color:#9aa39a;font-size:11px">Lake Roots Café Market Bar &middot; Crystal Lake</div>
    </div>
  </div></body></html>`;
}

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const subId = (body?.submission_id ?? (body?.record as Record<string, unknown>)?.submission_id) as string | undefined;
    if (!subId) return Response.json({ skipped: "no submission_id" });

    const s = ((await (await fetch(
      `${SUPABASE_URL}/rest/v1/service_reports?id=eq.${subId}&select=*`,
      { headers: H },
    )).json())?.[0] ?? {}) as Record<string, unknown>;
    if (!s.id) return Response.json({ skipped: "report not found" });
    if (s.source && s.source !== "web") return Response.json({ skipped: "non-web source" });

    if (!RESEND_API_KEY) return Response.json({ skipped: "RESEND_API_KEY not set" });

    const subject = `New service report: ${String(s.equipment || s.area || "maintenance")}` +
      (s.visit_type === "Repair" ? " (repair)" : "");
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: MANAGERS, subject, html: buildEmail(s) }),
    });

    const out = await send.json().catch(() => ({}));
    return Response.json({ ok: send.ok, resend: out }, { status: send.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ error: String(e) });
  }
});
