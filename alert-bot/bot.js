// Bot wiring: Telegram commands + MEXC polling. Network clients are injected so tests can fake them.
import fs from "node:fs";
import * as core from "./core.js";

export function loadState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { users: {}, knownSymbols: [], offset: 0 };
  }
}

export function saveState(file, state) {
  fs.writeFileSync(file + ".tmp", JSON.stringify(state));
  fs.renameSync(file + ".tmp", file);
}

export function createBot({ tg, mexc, state, config, save = () => {}, now = () => Date.now() }) {
  let history = [];
  let lastPrices = {};
  const moveCooldown = {}; // symbol -> time of last move alert

  const user = (chatId) => (state.users[chatId] ||= { targets: [], listings: true });

  async function safeSend(chatId, text) {
    try {
      await tg.send(chatId, text);
    } catch (err) {
      // A user who blocked the bot shouldn't stop alerts for everyone else.
      console.error(`send to ${chatId} failed: ${err.message}`);
      if (/blocked|deactivated|chat not found/i.test(err.message)) delete state.users[chatId];
    }
  }

  async function handleCommand(chatId, { cmd, args }) {
    const u = user(chatId);
    const plan = core.planFor(u, now());

    switch (cmd) {
      case "start":
      case "help":
        return tg.send(chatId, core.HELP);

      case "price": {
        const symbol = core.normalizeSymbol(args[0]);
        const price = symbol && lastPrices[symbol];
        return tg.send(chatId, price ? `${symbol}: ${core.formatPrice(price)}` : "Unknown symbol. Try /price BTC");
      }

      case "alert": {
        const symbol = core.normalizeSymbol(args[0]);
        const target = Number(String(args[1] || "").replace(/,/g, ""));
        if (!symbol || !(target > 0)) return tg.send(chatId, "Usage: /alert BTC 70000");
        if (Object.keys(lastPrices).length && !lastPrices[symbol]) {
          return tg.send(chatId, `${symbol} isn't traded on MEXC.`);
        }
        if (u.targets.length >= plan.maxTargets) {
          return tg.send(chatId, `Your plan allows ${plan.maxTargets} alerts. /upgrade for up to ${core.PLANS.pro.maxTargets}.`);
        }
        u.targets.push(core.makeTarget(symbol, target, lastPrices[symbol]));
        save();
        return tg.send(chatId, `✅ I'll tell you when ${symbol} reaches ${core.formatPrice(target)}.`);
      }

      case "alerts":
        if (!u.targets.length) return tg.send(chatId, "No alerts yet. Try /alert BTC 70000");
        return tg.send(chatId, u.targets.map((t, i) => `${i + 1}. ${t.symbol} ${t.direction} ${core.formatPrice(t.price)}`).join("\n"));

      case "remove": {
        const i = Number(args[0]) - 1;
        if (!u.targets[i]) return tg.send(chatId, "Usage: /remove 1 (see /alerts)");
        const [removed] = u.targets.splice(i, 1);
        save();
        return tg.send(chatId, `Removed ${removed.symbol} ${core.formatPrice(removed.price)}.`);
      }

      case "listings":
        u.listings = args[0] !== "off";
        save();
        return tg.send(chatId, `New-listing alerts ${u.listings ? "on" : "off"}.`);

      case "upgrade":
        return tg.sendStarsInvoice(chatId, {
          title: "ListingRadar Pro (30 days)",
          description: `Up to ${core.PLANS.pro.maxTargets} price alerts plus instant big-move alerts.`,
          payload: "pro30",
          stars: config.proStars,
        });

      case "status": {
        const pro = core.isPro(u, now());
        const until = pro ? ` until ${new Date(u.proUntil).toISOString().slice(0, 10)}` : "";
        return tg.send(chatId, `Plan: ${pro ? "Pro" + until : "Free"}\nAlerts: ${u.targets.length}/${plan.maxTargets}`);
      }

      default:
        return tg.send(chatId, core.HELP);
    }
  }

  async function handleUpdate(update) {
    if (update.pre_checkout_query) {
      return tg.answerPreCheckout(update.pre_checkout_query.id, update.pre_checkout_query.invoice_payload === "pro30");
    }
    const msg = update.message;
    if (!msg) return;
    const chatId = msg.chat.id;
    if (msg.successful_payment) {
      state.users[chatId] = core.extendPro(user(chatId), 30, now());
      save();
      return tg.send(chatId, "⭐ You're Pro for 30 days. Thanks! Big-move alerts are now on.");
    }
    const command = core.parseCommand(msg.text);
    if (command) return handleCommand(chatId, command);
  }

  async function checkListings() {
    const symbols = await mexc.getSymbols();
    const first = state.knownSymbols.length === 0;
    const fresh = core.findNewListings(state.knownSymbols, symbols);
    state.knownSymbols = symbols.map((s) => s.symbol);
    save();
    if (first) return []; // First run only learns the current list.
    for (const symbol of fresh) {
      const text = core.listingMessage(symbol, config.inviteCode);
      if (config.channelId) await safeSend(config.channelId, text);
      for (const [chatId, u] of Object.entries(state.users)) if (u.listings) await safeSend(chatId, text);
    }
    return fresh;
  }

  async function checkPrices() {
    lastPrices = await mexc.getPrices();
    const t = now();

    for (const [chatId, u] of Object.entries(state.users)) {
      const hit = u.targets.filter((x) => lastPrices[x.symbol] != null && core.targetHit(x, lastPrices[x.symbol]));
      if (!hit.length) continue;
      u.targets = u.targets.filter((x) => !hit.includes(x));
      for (const target of hit) await safeSend(chatId, core.targetMessage(target, lastPrices[target.symbol], config.inviteCode));
    }

    const watched = Object.fromEntries(Object.entries(lastPrices).filter(([s]) => s.endsWith("USDT")));
    history = core.pushSnapshot(history, { t, prices: watched }, config.moveWindowMin * 60_000);
    const moves = core.findMoves(history, config.movePct).filter((m) => !(moveCooldown[m.symbol] > t - config.moveWindowMin * 60_000));
    for (const move of moves.slice(0, 5)) {
      moveCooldown[move.symbol] = t;
      const text = core.moveMessage(move, config.moveWindowMin, config.inviteCode);
      for (const [chatId, u] of Object.entries(state.users)) if (core.isPro(u, t)) await safeSend(chatId, text);
    }
    save();
  }

  return { handleUpdate, checkListings, checkPrices };
}
