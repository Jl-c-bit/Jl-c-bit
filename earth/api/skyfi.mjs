// LiveEarth server API: finds and orders fresh high-resolution satellite photos
// through the SkyFi Platform API (https://app.skyfi.com/platform-api).
//
// The browser never sees the SkyFi key. Anything that spends money needs the
// owner's passcode and is refused above a per-order price cap.
//
// Environment:
//   SKYFI_API_KEY          required; from the SkyFi app, My Profile > API key
//   EARTH_ORDER_PASSCODE   required to enable ordering; without it the map can
//                          only search
//   EARTH_MAX_ORDER_USD    optional per-order cap, default 500
//   SKYFI_BASE_URL         optional; override for tests

const DEFAULT_BASE = "https://app.skyfi.com/platform-api";
const DEFAULT_MAX_USD = 500;
const API_PREFIX = "/earth/api";

// Photo sizes the map offers, as the side of a square in km.
const AREA_SIDES_KM = { block: 1, neighbourhood: 3, district: 5 };

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// ---------- geometry ----------

export function squareAoi(lat, lng, sideKm) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    throw new HttpError(400, "A valid lat and lng are required.");
  }
  const half = sideKm / 2;
  const dLat = half / 110.574;
  const dLng = half / (111.32 * Math.cos((lat * Math.PI) / 180));
  const r = (n) => Number(n.toFixed(6));
  const s = r(lat - dLat), n = r(lat + dLat), w = r(lng - dLng), e = r(lng + dLng);
  return {
    wkt: `POLYGON ((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`,
    areaKm2: sideKm * sideKm,
    bounds: [[s, w], [n, e]],
  };
}

function aoiFromBody(body) {
  const side = AREA_SIDES_KM[body.area] ?? AREA_SIDES_KM.block;
  return squareAoi(Number(body.lat), Number(body.lng), side);
}

// What an archive image of this AOI costs: providers bill at least minSqKm.
export function archivePriceUsd(archive, aoiKm2) {
  if (archive.openData) return 0;
  const billedKm2 = Math.max(aoiKm2, archive.minSqKm || 0);
  return Math.round(billedKm2 * (archive.priceForOneSquareKm || 0) * 100) / 100;
}

export function passPriceUsd(pass, aoiKm2) {
  const billedKm2 = Math.max(aoiKm2, pass.minSquareKms || 0);
  return Math.round(billedKm2 * (pass.priceForOneSquareKm || 0) * 100) / 100;
}

// ---------- SkyFi client ----------

function skyfi(env) {
  const key = env.SKYFI_API_KEY;
  if (!key) throw new HttpError(503, "SkyFi is not connected yet: set SKYFI_API_KEY on the Netlify site.");
  const base = (env.SKYFI_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");

  async function call(method, path, body, { redirect = "follow" } = {}) {
    const res = await fetch(base + path, {
      method,
      redirect,
      headers: {
        "X-Skyfi-Api-Key": key,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (redirect === "manual" && res.status >= 300 && res.status < 400) {
      return { location: res.headers.get("location") };
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { detail: text.slice(0, 300) }; }
    if (!res.ok) {
      const detail = typeof data?.detail === "string" ? data.detail : JSON.stringify(data?.detail ?? data ?? "");
      throw new HttpError(res.status === 401 ? 502 : res.status >= 500 ? 502 : res.status,
        `SkyFi said: ${detail || res.statusText}`.slice(0, 500));
    }
    return data;
  }
  return { call };
}

// ---------- access control ----------

function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function requireOwner(request, env) {
  if (!env.EARTH_ORDER_PASSCODE) {
    throw new HttpError(403, "Ordering is switched off: set EARTH_ORDER_PASSCODE on the Netlify site.");
  }
  const given = request.headers.get("x-earth-passcode") || "";
  if (!given || !timingSafeEqual(given, env.EARTH_ORDER_PASSCODE)) {
    throw new HttpError(401, "Wrong or missing passcode.");
  }
}

function maxOrderUsd(env) {
  const n = Number(env.EARTH_MAX_ORDER_USD);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_USD;
}

function checkCap(priceUsd, env) {
  const cap = maxOrderUsd(env);
  if (!(priceUsd <= cap)) {
    throw new HttpError(402, `This order is about $${priceUsd.toFixed(2)}, above your $${cap} per-order cap (EARTH_MAX_ORDER_USD).`);
  }
}

// ---------- shaping responses for the map ----------

function trimArchive(a, aoiKm2) {
  return {
    archiveId: a.archiveId,
    provider: a.provider,
    constellation: a.constellation,
    productType: a.productType,
    resolution: a.resolution,
    // platformResolution is in cm; gsd has no documented unit, so treat small values as metres.
    gsdCm: a.platformResolution ?? (a.gsd != null ? Math.round(a.gsd < 20 ? a.gsd * 100 : a.gsd) : null),
    captureTimestamp: a.captureTimestamp,
    cloudCoveragePercent: a.cloudCoveragePercent,
    offNadirAngle: a.offNadirAngle,
    footprint: a.footprint,
    openData: !!a.openData,
    minSqKm: a.minSqKm,
    deliveryTimeHours: a.deliveryTimeHours,
    priceUsd: archivePriceUsd(a, aoiKm2),
    thumbnailUrls: a.thumbnailUrls || null,
    tilesUrl: a.tilesUrl || null,
  };
}

function trimOrder(o) {
  return {
    orderId: o.orderId || o.id,
    orderType: o.orderType,
    status: o.status,
    orderCostUsd: typeof o.orderCost === "number" ? o.orderCost / 100 : null,
    aoi: o.aoi,
    label: o.orderLabel || o.label,
    createdAt: o.createdAt,
    windowStart: o.windowStart,
    windowEnd: o.windowEnd,
    tilesUrl: o.tilesUrl || null,
    hasImage: !!(o.downloadImageUrl || o.downloadCogUrl || o.status === "DELIVERY_COMPLETED"),
    captureTimestamp: o.archive?.captureTimestamp || null,
    events: Array.isArray(o.events)
      ? o.events.map((e) => ({ status: e.status || e.event?.status, at: e.timestamp || e.createdAt || e.event?.timestamp })).slice(-8)
      : undefined,
  };
}

// ---------- routes ----------

async function search(body, env) {
  const aoi = aoiFromBody(body);
  const days = Math.min(Math.max(Number(body.days) || 30, 1), 365);
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400000);
  const data = await skyfi(env).call("POST", "/archives", {
    aoi: aoi.wkt,
    fromDate: from.toISOString().replace(/\.\d+Z$/, "+00:00"),
    toDate: now.toISOString().replace(/\.\d+Z$/, "+00:00"),
    maxCloudCoveragePercent: Math.min(Math.max(Number(body.maxCloud ?? 40), 0), 100),
    productTypes: ["DAY"],
    minOverlapRatio: 0.9,
    pageSize: 50,
  });
  const archives = (data?.archives || [])
    .map((a) => trimArchive(a, aoi.areaKm2))
    .sort((a, b) => String(b.captureTimestamp).localeCompare(String(a.captureTimestamp)));
  return { aoi, archives };
}

async function passes(body, env) {
  const aoi = aoiFromBody(body);
  const hours = Math.min(Math.max(Number(body.hours) || 48, 6), 14 * 24);
  const now = new Date();
  const data = await skyfi(env).call("POST", "/feasibility/pass-prediction", {
    aoi: aoi.wkt,
    fromDate: now.toISOString(),
    toDate: new Date(now.getTime() + hours * 3600000).toISOString(),
    productTypes: ["DAY", "SAR"],
    maxOffNadirAngle: 30,
  });
  const list = (data?.passes || [])
    .map((p) => ({
      provider: p.provider,
      satellite: p.satname,
      productType: p.productType,
      resolution: p.resolution,
      passDate: p.passDate,
      offNadirAngle: p.offNadirAngle,
      solarElevationAngle: p.solarElevationAngle,
      minSquareKms: p.minSquareKms,
      priceUsd: passPriceUsd(p, aoi.areaKm2),
    }))
    .filter((p) => p.passDate)
    .sort((a, b) => String(a.passDate).localeCompare(String(b.passDate)));
  return { aoi, passes: list };
}

async function orderArchive(request, body, env) {
  requireOwner(request, env);
  if (!body.archiveId || typeof body.archiveId !== "string") throw new HttpError(400, "archiveId is required.");
  const aoi = aoiFromBody(body);
  const client = skyfi(env);
  // Price from SkyFi's own record, not from the browser.
  const archive = await client.call("GET", `/archives/${encodeURIComponent(body.archiveId)}`);
  const price = archivePriceUsd(archive, aoi.areaKm2);
  checkCap(price, env);
  if (Number.isFinite(Number(body.expectedUsd)) && price > Number(body.expectedUsd) * 1.05 + 0.01) {
    throw new HttpError(409, `The price changed to $${price.toFixed(2)}. Check it and try again.`);
  }
  const order = await client.call("POST", "/order-archive", {
    aoi: aoi.wkt,
    archiveId: body.archiveId,
    deliveryDriver: "NONE",
    orderLabel: "LiveEarth",
    metadata: { source: "liveearth", lat: Number(body.lat), lng: Number(body.lng) },
  });
  return { order: trimOrder(order), priceUsd: price };
}

async function orderTasking(request, body, env) {
  requireOwner(request, env);
  const aoi = aoiFromBody(body);
  const hours = Math.min(Math.max(Number(body.hours) || 48, 12), 14 * 24);
  const productType = body.productType === "SAR" ? "SAR" : "DAY";
  if (!body.resolution || typeof body.resolution !== "string") throw new HttpError(400, "resolution is required.");
  const estimate = Number(body.estimateUsd);
  if (!Number.isFinite(estimate) || estimate <= 0) throw new HttpError(400, "A price estimate from a satellite pass is required.");
  checkCap(estimate, env);
  const start = new Date(Date.now() + 5 * 60000);
  const order = await skyfi(env).call("POST", "/order-tasking", {
    aoi: aoi.wkt,
    windowStart: start.toISOString(),
    windowEnd: new Date(start.getTime() + hours * 3600000).toISOString(),
    productType,
    resolution: body.resolution,
    priorityItem: !!body.priority,
    maxCloudCoveragePercent: productType === "SAR" ? 100 : 20,
    maxOffNadirAngle: 30,
    ...(body.provider ? { requiredProvider: String(body.provider) } : {}),
    deliveryDriver: "NONE",
    orderLabel: "LiveEarth",
    metadata: { source: "liveearth", lat: Number(body.lat), lng: Number(body.lng) },
  });
  const trimmed = trimOrder(order);
  // SkyFi reports the real cost once the order exists; flag it if it's over the cap.
  const overCap = trimmed.orderCostUsd != null && trimmed.orderCostUsd > maxOrderUsd(env);
  return { order: trimmed, overCap };
}

async function listOrders(request, env) {
  requireOwner(request, env);
  const data = await skyfi(env).call("GET", "/orders");
  return { orders: (data?.orders || []).slice(0, 25).map(trimOrder) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getOrder(request, env, id) {
  requireOwner(request, env);
  if (!UUID.test(id)) throw new HttpError(400, "Bad order id.");
  return { order: trimOrder(await skyfi(env).call("GET", `/orders/${id}`)) };
}

async function downloadLink(request, env, id, type) {
  requireOwner(request, env);
  if (!UUID.test(id)) throw new HttpError(400, "Bad order id.");
  const kind = ["image", "cog", "payload"].includes(type) ? type : "image";
  const res = await skyfi(env).call("GET", `/orders/${id}/${kind}`, null, { redirect: "manual" });
  const url = res?.location || res?.url || res?.download_url;
  if (!url) throw new HttpError(404, "The image isn't ready to download yet.");
  return { url };
}

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : url.pathname;
  const method = request.method.toUpperCase();
  try {
    let body = {};
    if (method === "POST") {
      try { body = (await request.json()) || {}; } catch { throw new HttpError(400, "Send a JSON body."); }
    }
    if (method === "GET" && path === "/status") {
      return json(200, {
        configured: !!env.SKYFI_API_KEY,
        ordering: !!(env.SKYFI_API_KEY && env.EARTH_ORDER_PASSCODE),
        maxOrderUsd: maxOrderUsd(env),
        areas: AREA_SIDES_KM,
      });
    }
    if (method === "POST" && path === "/search") return json(200, await search(body, env));
    if (method === "POST" && path === "/passes") return json(200, await passes(body, env));
    if (method === "POST" && path === "/order-archive") return json(201, await orderArchive(request, body, env));
    if (method === "POST" && path === "/order-tasking") return json(201, await orderTasking(request, body, env));
    if (method === "GET" && path === "/orders") return json(200, await listOrders(request, env));
    let m = /^\/orders\/([^/]+)$/.exec(path);
    if (method === "GET" && m) return json(200, await getOrder(request, env, m[1]));
    m = /^\/orders\/([^/]+)\/download$/.exec(path);
    if (method === "GET" && m) return json(200, await downloadLink(request, env, m[1], url.searchParams.get("type")));
    throw new HttpError(404, "Unknown endpoint.");
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    console.error("earth-api error", err);
    return json(502, { error: "Couldn't reach SkyFi. Try again in a minute." });
  }
}
