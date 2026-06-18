// Google reviews -> Guest Experience board.
//
// STATUS: pre-built, NOT yet deployed. Waiting on Google Business Profile API
// access approval (support case 9-2948000042021, project 1019055047763).
//
// Once approved, finish Step 4 (OAuth) and set these Supabase secrets, then
// deploy this function and schedule it daily (pg_cron / Supabase schedule):
//   GBP_CLIENT_ID       OAuth client id
//   GBP_CLIENT_SECRET   OAuth client secret
//   GBP_REFRESH_TOKEN   refresh token for carlie@lakerootscl.com (offline access)
//   GBP_ACCOUNT_ID      Business Profile account id   (accounts/<id>)
//   GBP_LOCATION_ID     Lake Roots location id        (locations/<id>)
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// It fetches reviews via the v4 Business Profile API, maps star rating ->
// sentiment, and inserts only NEW reviews into feedback_submissions
// (source='google', deduped on legacy_key='google:<reviewId>'), so the
// dashboard's sentiment mix + "What to Fix" themes pick them up automatically.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const sentiment = (n: number) => (n >= 4 ? "Positive" : n <= 2 ? "Negative" : "Other");

function mdy(iso: string): string {
  const d = new Date(iso);
  return isNaN(+d) ? "" : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

async function accessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: Deno.env.get("GBP_CLIENT_ID")!,
    client_secret: Deno.env.get("GBP_CLIENT_SECRET")!,
    refresh_token: Deno.env.get("GBP_REFRESH_TOKEN")!,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  const j = await r.json();
  if (!j.access_token) throw new Error("token exchange failed: " + JSON.stringify(j));
  return j.access_token;
}

async function fetchReviews(token: string): Promise<any[]> {
  const acct = Deno.env.get("GBP_ACCOUNT_ID");
  const loc = Deno.env.get("GBP_LOCATION_ID");
  const out: any[] = [];
  let pageToken = "";
  do {
    const url = `https://mybusiness.googleapis.com/v4/accounts/${acct}/locations/${loc}/reviews?pageSize=50` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    if (j.error) throw new Error("reviews fetch: " + JSON.stringify(j.error));
    (j.reviews || []).forEach((x: any) => out.push(x));
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out;
}

async function existingKeys(): Promise<Set<string>> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/feedback_submissions?source=eq.google&select=legacy_key`,
    { headers: H },
  );
  const rows = await r.json();
  return new Set((rows || []).map((x: any) => x.legacy_key).filter(Boolean));
}

function toRow(rv: any) {
  const stars = STAR[rv.starRating] || 0;
  const name = rv.reviewer?.displayName || "";
  const text = (rv.comment || "").replace(/\s+/g, " ").trim();
  const oneLine = text || `(no written review — ${stars}★)`;
  return {
    legacy_key: "google:" + rv.reviewId,
    fb_date: mdy(rv.createTime),
    sentiment: sentiment(stars),
    type: "Review",
    guests: 1,
    label: (name ? name + ": " : "") + oneLine.slice(0, 80) + (oneLine.length > 80 ? "…" : ""),
    feedback: rv.comment || null,
    extra: ["Google review", stars + "★", name && ("by " + name)].filter(Boolean).join(" · "),
    source: "google",
  };
}

Deno.serve(async () => {
  try {
    if (!Deno.env.get("GBP_REFRESH_TOKEN")) {
      return Response.json({ skipped: "not configured yet — set GBP_* secrets after API approval" }, { status: 503 });
    }
    const token = await accessToken();
    const reviews = await fetchReviews(token);
    const seen = await existingKeys();
    const fresh = reviews.filter((rv) => rv.reviewId && !seen.has("google:" + rv.reviewId)).map(toRow);
    let inserted = 0;
    if (fresh.length) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/feedback_submissions`, {
        method: "POST",
        headers: { ...H, Prefer: "return=minimal" },
        body: JSON.stringify(fresh),
      });
      if (!r.ok) throw new Error("insert failed: " + (await r.text()));
      inserted = fresh.length;
    }
    return Response.json({ ok: true, fetched: reviews.length, inserted });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
