import test from "node:test";
import assert from "node:assert/strict";
import { createBot } from "../bot.js";

function setup({ symbols = [], prices = {} } = {}) {
  const sent = [];
  const tg = {
    send: async (chatId, text) => sent.push({ chatId: String(chatId), text }),
    sendStarsInvoice: async (chatId, inv) => sent.push({ chatId: String(chatId), invoice: inv }),
    answerPreCheckout: async (id, ok) => sent.push({ preCheckout: id, ok }),
  };
  const market = { symbols, prices };
  const mexc = { getSymbols: async () => market.symbols, getPrices: async () => market.prices };
  const state = { users: {}, knownSymbols: [], offset: 0 };
  let t = 0;
  const config = { inviteCode: "ref1", channelId: "@chan", proStars: 250, movePct: 10, moveWindowMin: 15 };
  const bot = createBot({ tg, mexc, state, config, now: () => t });
  const say = (chatId, text) => bot.handleUpdate({ message: { chat: { id: chatId }, text } });
  return { bot, sent, state, market, say, tick: (ms) => (t += ms) };
}

test("price target alert fires once then is removed", async () => {
  const s = setup({ prices: { BTCUSDT: 65000 } });
  await s.bot.checkPrices();
  await s.say(1, "/alert btc 70,000");
  assert.match(s.sent.at(-1).text, /BTCUSDT reaches 70,000/);
  s.market.prices = { BTCUSDT: 70100 };
  await s.bot.checkPrices();
  assert.match(s.sent.at(-1).text, /🎯 BTCUSDT hit 70,000/);
  assert.match(s.sent.at(-1).text, /inviteCode=ref1/);
  assert.equal(s.state.users[1].targets.length, 0);
});

test("free plan is capped and rejects unknown symbols", async () => {
  const s = setup({ prices: { BTCUSDT: 1, ETHUSDT: 1 } });
  await s.bot.checkPrices();
  await s.say(1, "/alert FAKE 5");
  assert.match(s.sent.at(-1).text, /isn't traded/);
  await s.say(1, "/alert BTC 2");
  await s.say(1, "/alert ETH 2");
  await s.say(1, "/alert BTC 3");
  assert.match(s.sent.at(-1).text, /allows 2 alerts/);
});

test("first listing check only seeds; later new coins go to channel and users", async () => {
  const s = setup({ symbols: [{ symbol: "BTCUSDT", quoteAsset: "USDT" }] });
  await s.say(1, "/start");
  await s.say(2, "/listings off");
  assert.deepEqual(await s.bot.checkListings(), []);
  s.market.symbols = [...s.market.symbols, { symbol: "NEWUSDT", quoteAsset: "USDT" }];
  assert.deepEqual(await s.bot.checkListings(), ["NEWUSDT"]);
  const recipients = s.sent.filter((m) => m.text?.includes("NEWUSDT")).map((m) => m.chatId);
  assert.deepEqual(recipients, ["@chan", "1"]);
});

test("Stars payment unlocks Pro and big-move alerts", async () => {
  const s = setup({ prices: { PEPEUSDT: 1 } });
  await s.say(1, "/upgrade");
  assert.equal(s.sent.at(-1).invoice.stars, 250);
  await s.bot.handleUpdate({ pre_checkout_query: { id: "q", invoice_payload: "pro30" } });
  assert.deepEqual(s.sent.at(-1), { preCheckout: "q", ok: true });
  await s.bot.handleUpdate({ message: { chat: { id: 1 }, successful_payment: { total_amount: 250 } } });
  await s.say(2, "/start"); // free user

  await s.bot.checkPrices();
  s.tick(60_000);
  s.market.prices = { PEPEUSDT: 1.25 };
  await s.bot.checkPrices();
  const moveAlerts = s.sent.filter((m) => m.text?.includes("🚀"));
  assert.deepEqual(moveAlerts.map((m) => m.chatId), ["1"]);
  assert.match(moveAlerts[0].text, /\+25\.0% in 15 min/);

  s.tick(60_000);
  s.market.prices = { PEPEUSDT: 1.3 };
  await s.bot.checkPrices();
  assert.equal(s.sent.filter((m) => m.text?.includes("🚀")).length, 1, "cooldown prevents repeats");
});
