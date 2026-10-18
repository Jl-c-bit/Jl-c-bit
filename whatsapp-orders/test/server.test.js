import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server.js";

const business = {
  id: "diner",
  name: "Diner",
  phoneNumberId: "111",
  ownerPhone: "15550000000",
  dashboardKey: "secret",
  currency: "USD",
  paidUntil: "2099-01-01",
  delivery: { enabled: false },
  menu: [{ name: "Burger", price: 1000 }],
};

async function withServer(fn) {
  const sent = [];
  const ordersDir = fs.mkdtempSync(path.join(os.tmpdir(), "orders-"));
  const server = startServer(
    {
      businesses: [business],
      sendText: async (b, to, body) => sent.push({ to, body }),
      ordersDir,
      appSecret: "appsecret",
      verifyToken: "verify",
    },
    0,
  );
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ base, sent, ordersDir });
  } finally {
    server.close();
  }
}

function payload(from, text, phoneNumberId = "111") {
  return JSON.stringify({
    entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, messages: [{ from, type: "text", text: { body: text } }] } }] }],
  });
}

const sign = (body) => "sha256=" + crypto.createHmac("sha256", "appsecret").update(body).digest("hex");

async function send(base, from, text, phoneNumberId) {
  const body = payload(from, text, phoneNumberId);
  const res = await fetch(`${base}/webhook`, { method: "POST", body, headers: { "x-hub-signature-256": sign(body) } });
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 20)); // processing happens after the 200
}

test("webhook verification handshake", async () => {
  await withServer(async ({ base }) => {
    const ok = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=42`);
    assert.equal(await ok.text(), "42");
    const bad = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42`);
    assert.equal(bad.status, 403);
  });
});

test("rejects unsigned webhook posts", async () => {
  await withServer(async ({ base, sent }) => {
    const res = await fetch(`${base}/webhook`, { method: "POST", body: payload("1", "hi") });
    assert.equal(res.status, 401);
    assert.equal(sent.length, 0);
  });
});

test("order flow saves order, notifies owner, shows on dashboard", async () => {
  await withServer(async ({ base, sent, ordersDir }) => {
    for (const text of ["hi", "1x2", "done", "Pat <b>", "yes"]) await send(base, "15559998888", text);
    await send(base, "15559998888", "hi", "999"); // unknown business number is ignored

    const customer = sent.filter((m) => m.to === "15559998888");
    assert.match(customer.at(-1).body, /Order received/);
    const owner = sent.filter((m) => m.to === "15550000000");
    assert.equal(owner.length, 1);
    assert.match(owner[0].body, /New order #1 - Diner/);

    const saved = fs.readFileSync(path.join(ordersDir, "diner.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].total, 2000);

    const page = await (await fetch(`${base}/orders/diner?key=secret`)).text();
    assert.match(page, /#1 · Pat &lt;b&gt; · \$20\.00/);
    assert.equal((await fetch(`${base}/orders/diner?key=wrong`)).status, 404);
  });
});
