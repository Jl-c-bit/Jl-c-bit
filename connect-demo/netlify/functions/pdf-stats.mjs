// -----------------------------------------------------------------------------
// Visit counter for PrivatePDF:  POST /pdf/api/hit,  GET /pdf/api/stats
//
// Counts page views, referring sites and a few button events per day, so we
// can see whether promotion is working. It stores no cookies, IP addresses or
// file data: only counters, one Netlify Blobs entry per day.
// -----------------------------------------------------------------------------
import { getStore } from "@netlify/blobs";

const EVENTS = new Set(["task_done", "pro_open", "buy_click", "limit_hit"]);
const KEEP_DAYS = 30;

const day = (d = new Date()) => d.toISOString().slice(0, 10);

/** Clean an incoming hit. Returns null when there is nothing worth counting. */
export function cleanHit(body) {
  if (!body || typeof body !== "object") return null;
  const path = typeof body.p === "string" && /^\/pdf\/[a-z0-9\-/]*$/.test(body.p) ? body.p.slice(0, 60) : null;
  const event = typeof body.e === "string" && EVENTS.has(body.e) ? body.e : null;
  let ref = null;
  if (typeof body.r === "string" && body.r) {
    try {
      const host = new URL(body.r).hostname.replace(/^www\./, "");
      if (host && !host.endsWith("netlify.app")) ref = host.slice(0, 60);
    } catch { /* not a URL */ }
  }
  if (!path && !event) return null;
  return { path, event, ref };
}

/** Add one cleaned hit to a day's counters. */
export function addHit(counts, hit) {
  const c = { views: {}, refs: {}, events: {}, ...counts };
  const bump = (bucket, key) => { c[bucket] = { ...c[bucket], [key]: (c[bucket][key] || 0) + 1 }; };
  if (hit.event) bump("events", hit.event);
  else if (hit.path) {
    bump("views", hit.path);
    if (hit.ref) bump("refs", hit.ref);
  }
  return c;
}

export function createHandler(store) {
  return async function handler(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/hit")) {
      let body = null;
      try { body = JSON.parse(await request.text()); } catch { /* ignore */ }
      const hit = cleanHit(body);
      if (hit) {
        const key = day();
        const counts = (await store.get(key, { type: "json" })) || {};
        await store.setJSON(key, addHit(counts, hit));
      }
      return new Response(null, { status: 204 });
    }
    if (request.method === "GET" && url.pathname.endsWith("/stats")) {
      const days = [];
      for (let i = 0; i < KEEP_DAYS; i++) {
        const key = day(new Date(Date.now() - i * 864e5));
        const counts = await store.get(key, { type: "json" });
        if (counts) days.push({ day: key, ...counts });
      }
      return Response.json({ days }, { headers: { "cache-control": "no-store" } });
    }
    return new Response("Not found", { status: 404 });
  };
}

export default (request) => createHandler(getStore({ name: "pdf-stats", consistency: "strong" }))(request);

export const config = { path: ["/pdf/api/hit", "/pdf/api/stats"] };
