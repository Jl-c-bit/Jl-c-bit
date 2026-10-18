// WhatsApp Cloud API webhook: one server, many businesses (each keyed by its WhatsApp phone_number_id).
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as core from "./core.js";

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function createSender(defaultToken, apiVersion = "v21.0") {
  return async function sendText(business, to, body) {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${business.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${business.accessToken || defaultToken}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
    if (!res.ok) throw new Error(`WhatsApp send -> HTTP ${res.status}: ${await res.text()}`);
  };
}

export function validSignature(appSecret, rawBody, header) {
  if (!appSecret) return true;
  if (!header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

// Pull { phoneNumberId, from, text } out of a Cloud API webhook payload.
export function extractMessages(payload) {
  const out = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      for (const msg of value.messages || []) {
        const text = msg.type === "text" ? msg.text?.body : msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title;
        out.push({ phoneNumberId, from: msg.from, text: text ?? "" });
      }
    }
  }
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function createApp({ businesses, sendText, ordersDir, appSecret, verifyToken, now = () => new Date() }) {
  const byNumber = new Map(businesses.map((b) => [String(b.phoneNumberId), b]));
  const byId = new Map(businesses.map((b) => [b.id, b]));
  const sessions = new Map();
  fs.mkdirSync(ordersDir, { recursive: true });

  const ordersFile = (b) => path.join(ordersDir, `${b.id}.jsonl`);
  function readOrders(b) {
    try {
      return fs.readFileSync(ordersFile(b), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  async function handleIncoming({ phoneNumberId, from, text }) {
    const business = byNumber.get(String(phoneNumberId));
    if (!business) return;
    const key = `${business.id}:${from}`;
    const t = now().getTime();
    const saved = sessions.get(key);
    const session = saved && t - saved.at < SESSION_TTL_MS ? saved.session : core.newSession();

    const result = core.handleMessage(business, session, text, { now: now() });
    sessions.set(key, { session: result.session, at: t });
    for (const r of result.replies) await sendText(business, from, r);

    if (result.order) {
      const order = { ...result.order, number: readOrders(business).length + 1, customer: from, at: now().toISOString() };
      fs.appendFileSync(ordersFile(business), JSON.stringify(order) + "\n");
      // WhatsApp only delivers free-form messages within 24h of the owner's last message to this number,
      // so the dashboard is the reliable copy.
      if (business.ownerPhone) {
        await sendText(business, business.ownerPhone, core.ownerOrderText(business, order)).catch((err) =>
          console.error(`owner notify (${business.id}): ${err.message}`),
        );
      }
    }
  }

  function ordersPage(business) {
    const orders = readOrders(business).reverse().slice(0, 100);
    const rows = orders
      .map(
        (o) => `<article><h2>#${o.number} · ${escapeHtml(o.name)} · ${core.formatMoney(o.total, business.currency)}</h2>
<p>${new Date(o.at).toLocaleString()} · +${escapeHtml(o.customer)} · ${o.fulfilment === "delivery" ? "Delivery: " + escapeHtml(o.address) : "Pickup"}</p>
<ul>${o.lines.map((l) => `<li>${l.qty} × ${escapeHtml(l.name)}</li>`).join("")}</ul></article>`,
      )
      .join("");
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="20"><title>${escapeHtml(business.name)} orders</title>
<style>body{font:16px system-ui,sans-serif;margin:0 auto;max-width:640px;padding:16px;background:#f6f6f4;color:#1b1b1b}
article{background:#fff;border-radius:12px;padding:12px 16px;margin:12px 0;box-shadow:0 1px 3px #0002}h2{font-size:18px;margin:0}p{color:#555;margin:4px 0}</style>
<h1>${escapeHtml(business.name)} · orders</h1>${rows || "<p>No orders yet. This page refreshes every 20 seconds.</p>"}`;
  }

  return async function handler(req, res) {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/webhook") {
      const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === verifyToken;
      res.writeHead(ok ? 200 : 403).end(ok ? url.searchParams.get("hub.challenge") : "forbidden");
      return;
    }

    if (req.method === "POST" && url.pathname === "/webhook") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks);
      if (!validSignature(appSecret, raw, req.headers["x-hub-signature-256"])) {
        res.writeHead(401).end();
        return;
      }
      res.writeHead(200).end(); // Acknowledge fast; Meta retries slow webhooks.
      let payload;
      try {
        payload = JSON.parse(raw.toString("utf8"));
      } catch {
        return;
      }
      for (const m of extractMessages(payload)) await handleIncoming(m).catch((err) => console.error(`message: ${err.message}`));
      return;
    }

    const ordersMatch = url.pathname.match(/^\/orders\/([\w-]+)$/);
    if (req.method === "GET" && ordersMatch) {
      const business = byId.get(ordersMatch[1]);
      if (!business || !business.dashboardKey || url.searchParams.get("key") !== business.dashboardKey) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(ordersPage(business));
      return;
    }

    if (url.pathname === "/health") {
      res.writeHead(200).end("ok");
      return;
    }
    res.writeHead(404).end("not found");
  };
}

export function startServer(options, port) {
  const app = createApp(options);
  return http.createServer((req, res) => app(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500).end();
  })).listen(port);
}
