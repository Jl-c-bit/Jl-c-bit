import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../core.js";

test("normalizes symbols", () => {
  assert.equal(core.normalizeSymbol("btc"), "BTCUSDT");
  assert.equal(core.normalizeSymbol("BTC/USDT"), "BTCUSDT");
  assert.equal(core.normalizeSymbol("ethusdt"), "ETHUSDT");
  assert.equal(core.normalizeSymbol(""), null);
});

test("parses commands, including @botname suffix", () => {
  assert.deepEqual(core.parseCommand("/alert BTC 70000"), { cmd: "alert", args: ["BTC", "70000"] });
  assert.deepEqual(core.parseCommand("/help@MexcAlertsBot"), { cmd: "help", args: [] });
  assert.equal(core.parseCommand("hello"), null);
});

test("finds only new USDT listings", () => {
  const current = [
    { symbol: "BTCUSDT", quoteAsset: "USDT" },
    { symbol: "NEWUSDT", quoteAsset: "USDT" },
    { symbol: "NEWBTC", quoteAsset: "BTC" },
  ];
  assert.deepEqual(core.findNewListings(["BTCUSDT"], current), ["NEWUSDT"]);
});

test("targets fire from the side they were set on", () => {
  const up = core.makeTarget("BTCUSDT", 70000, 65000);
  assert.equal(up.direction, "above");
  assert.equal(core.targetHit(up, 69999), false);
  assert.equal(core.targetHit(up, 70000), true);
  const down = core.makeTarget("BTCUSDT", 60000, 65000);
  assert.equal(down.direction, "below");
  assert.equal(core.targetHit(down, 60500), false);
  assert.equal(core.targetHit(down, 59000), true);
});

test("detects big moves within the window and drops old snapshots", () => {
  let h = [];
  h = core.pushSnapshot(h, { t: 0, prices: { A: 100, B: 100 } }, 15 * 60_000);
  h = core.pushSnapshot(h, { t: 60_000, prices: { A: 115, B: 103 } }, 15 * 60_000);
  assert.deepEqual(core.findMoves(h, 10).map((m) => m.symbol), ["A"]);
  h = core.pushSnapshot(h, { t: 20 * 60_000, prices: { A: 116, B: 103 } }, 15 * 60_000);
  assert.equal(h.length, 1);
  assert.deepEqual(core.findMoves(h, 10), []);
});

test("pro extends from the later of now or current expiry", () => {
  const day = 86_400_000;
  const u = core.extendPro({}, 30, 0);
  assert.equal(u.proUntil, 30 * day);
  assert.equal(core.extendPro(u, 30, day).proUntil, 60 * day);
  assert.equal(core.isPro(u, 31 * day), false);
});

test("trade link carries invite code", () => {
  assert.equal(core.tradeLink("PEPEUSDT", "abc"), "https://www.mexc.com/exchange/PEPE_USDT?inviteCode=abc");
  assert.equal(core.tradeLink("PEPEUSDT"), "https://www.mexc.com/exchange/PEPE_USDT");
});
