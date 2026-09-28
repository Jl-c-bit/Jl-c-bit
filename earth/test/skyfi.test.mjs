import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, squareAoi, archivePriceUsd } from "../api/skyfi.mjs";

const ENV = { SKYFI_API_KEY: "k", EARTH_ORDER_PASSCODE: "open sesame", EARTH_MAX_ORDER_USD: "200", SKYFI_BASE_URL: "https://skyfi.test/platform-api" };
const ORDER_ID = "0b6f7a52-1f7e-4a57-9a1e-3c1c1d3c0e11";

let calls;
let routes;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  routes = {};
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || "GET"} ${u.pathname.replace("/platform-api", "")}`;
    calls.push({ key, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    const route = routes[key];
    if (!route) return new Response(JSON.stringify({ detail: "no route " + key }), { status: 404 });
    return typeof route === "function" ? route() : new Response(JSON.stringify(route), { status: 200 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

function req(method, path, body, headers = {}) {
  return new Request("https://site.test/earth/api" + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const ARCHIVE = {
  archiveId: "arch-1", provider: "SATELLOGIC", productType: "DAY", resolution: "VERY HIGH",
  platformResolution: 70, captureTimestamp: "2026-09-28T01:00:00+00:00", cloudCoveragePercent: 3,
  minSqKm: 25, priceForOneSquareKm: 5, openData: false, footprint: "POLYGON((0 0,1 0,1 1,0 1,0 0))",
};

test("squareAoi builds a closed WKT square of the requested size", () => {
  const a = squareAoi(51.5, -0.12, 1);
  assert.match(a.wkt, /^POLYGON \(\((-?[\d.]+ -?[\d.]+, ){4}-?[\d.]+ -?[\d.]+\)\)$/);
  const pts = a.wkt.slice(10, -2).split(", ");
  assert.equal(pts[0], pts[4]);
  assert.equal(a.areaKm2, 1);
  assert.throws(() => squareAoi(NaN, 0, 1));
});

test("archive price bills at least the provider minimum area", () => {
  assert.equal(archivePriceUsd(ARCHIVE, 1), 125);
  assert.equal(archivePriceUsd({ ...ARCHIVE, openData: true }, 1), 0);
});

test("status reports configuration without leaking secrets", async () => {
  const res = await handleRequest(req("GET", "/status"), ENV);
  const body = await res.json();
  assert.deepEqual([body.configured, body.ordering, body.maxOrderUsd], [true, true, 200]);
  assert.ok(!JSON.stringify(body).includes("open sesame"));
  const off = await (await handleRequest(req("GET", "/status"), {})).json();
  assert.equal(off.configured, false);
});

test("search sends the key header and returns newest photos first with prices", async () => {
  routes["POST /archives"] = { archives: [ARCHIVE, { ...ARCHIVE, archiveId: "arch-2", captureTimestamp: "2026-09-28T05:00:00+00:00" }] };
  const res = await handleRequest(req("POST", "/search", { lat: 40.7, lng: -74, area: "block" }), ENV);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.archives.map((a) => a.archiveId), ["arch-2", "arch-1"]);
  assert.equal(body.archives[0].priceUsd, 125);
  assert.equal(body.archives[0].gsdCm, 70);
  assert.equal(calls[0].headers["X-Skyfi-Api-Key"], "k");
  assert.match(calls[0].body.aoi, /^POLYGON/);
});

test("search without a key explains the setup step", async () => {
  const res = await handleRequest(req("POST", "/search", { lat: 1, lng: 1 }), {});
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /SKYFI_API_KEY/);
});

test("ordering needs the right passcode", async () => {
  routes["GET /archives/arch-1"] = ARCHIVE;
  const noCode = await handleRequest(req("POST", "/order-archive", { archiveId: "arch-1", lat: 1, lng: 1 }), ENV);
  assert.equal(noCode.status, 401);
  const wrong = await handleRequest(req("POST", "/order-archive", { archiveId: "arch-1", lat: 1, lng: 1 }, { "x-earth-passcode": "nope" }), ENV);
  assert.equal(wrong.status, 401);
  const disabled = await handleRequest(req("POST", "/order-archive", { archiveId: "arch-1", lat: 1, lng: 1 }, { "x-earth-passcode": "x" }), { ...ENV, EARTH_ORDER_PASSCODE: "" });
  assert.equal(disabled.status, 403);
  assert.equal(calls.length, 0, "no SkyFi call without a valid passcode");
});

test("archive order uses SkyFi's price, not the browser's, and honours the cap", async () => {
  routes["GET /archives/arch-1"] = { ...ARCHIVE, priceForOneSquareKm: 10 }; // 25 km2 x $10 = $250 > $200 cap
  const res = await handleRequest(req("POST", "/order-archive", { archiveId: "arch-1", lat: 1, lng: 1, expectedUsd: 1 }, { "x-earth-passcode": "open sesame" }), ENV);
  assert.equal(res.status, 402);
  assert.ok(!calls.some((c) => c.key === "POST /order-archive"));
});

test("archive order refuses when the price rose since the user saw it", async () => {
  routes["GET /archives/arch-1"] = ARCHIVE; // $125
  const res = await handleRequest(req("POST", "/order-archive", { archiveId: "arch-1", lat: 1, lng: 1, expectedUsd: 100 }, { "x-earth-passcode": "open sesame" }), ENV);
  assert.equal(res.status, 409);
});

test("archive order goes through when price and passcode check out", async () => {
  routes["GET /archives/arch-1"] = ARCHIVE;
  routes["POST /order-archive"] = { orderId: ORDER_ID, orderType: "ARCHIVE", status: "CREATED", orderCost: 12500 };
  const res = await handleRequest(req("POST", "/order-archive", { archiveId: "arch-1", lat: 1, lng: 1, expectedUsd: 125 }, { "x-earth-passcode": "open sesame" }), ENV);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.order.orderId, ORDER_ID);
  assert.equal(body.order.orderCostUsd, 125);
  const sent = calls.find((c) => c.key === "POST /order-archive").body;
  assert.equal(sent.archiveId, "arch-1");
  assert.equal(sent.deliveryDriver, "NONE");
});

test("tasking order is capped by its estimate and sends a future window", async () => {
  const over = await handleRequest(req("POST", "/order-tasking", { lat: 1, lng: 1, resolution: "VERY HIGH", estimateUsd: 900 }, { "x-earth-passcode": "open sesame" }), ENV);
  assert.equal(over.status, 402);
  routes["POST /order-tasking"] = { orderId: ORDER_ID, orderType: "TASKING", status: "CREATED", orderCost: 15000 };
  const ok = await handleRequest(req("POST", "/order-tasking", { lat: 1, lng: 1, resolution: "VERY HIGH", estimateUsd: 150, priority: true, provider: "SATELLOGIC", hours: 24 }, { "x-earth-passcode": "open sesame" }), ENV);
  assert.equal(ok.status, 201);
  const sent = calls.find((c) => c.key === "POST /order-tasking").body;
  assert.equal(sent.priorityItem, true);
  assert.equal(sent.requiredProvider, "SATELLOGIC");
  assert.ok(new Date(sent.windowStart) > new Date());
  assert.equal(Math.round((new Date(sent.windowEnd) - new Date(sent.windowStart)) / 3600000), 24);
});

test("order status and download link", async () => {
  routes[`GET /orders/${ORDER_ID}`] = { orderId: ORDER_ID, status: "DELIVERY_COMPLETED", tilesUrl: "https://tiles.test/{z}/{x}/{y}.png", downloadImageUrl: "x" };
  routes[`GET /orders/${ORDER_ID}/image`] = () => new Response(null, { status: 307, headers: { location: "https://dl.test/img.png" } });
  const h = { "x-earth-passcode": "open sesame" };
  const s = await (await handleRequest(req("GET", `/orders/${ORDER_ID}`, null, h), ENV)).json();
  assert.equal(s.order.tilesUrl, "https://tiles.test/{z}/{x}/{y}.png");
  assert.equal(s.order.hasImage, true);
  const d = await (await handleRequest(req("GET", `/orders/${ORDER_ID}/download?type=image`, null, h), ENV)).json();
  assert.equal(d.url, "https://dl.test/img.png");
  const bad = await handleRequest(req("GET", "/orders/../../etc", null, h), ENV);
  assert.equal(bad.status, 404);
});

test("SkyFi errors come back as readable messages", async () => {
  routes["POST /archives"] = () => new Response(JSON.stringify({ detail: "AOI too large" }), { status: 422 });
  const res = await handleRequest(req("POST", "/search", { lat: 1, lng: 1 }), ENV);
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /AOI too large/);
});
