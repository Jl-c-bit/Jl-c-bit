// Pure bot logic (no network, no files), so it can be unit-tested with `node --test`.

export const PLANS = {
  free: { maxTargets: 2, moveAlerts: false },
  pro: { maxTargets: 50, moveAlerts: true },
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function isPro(user, now = Date.now()) {
  return Boolean(user && user.proUntil && user.proUntil > now);
}

export function planFor(user, now = Date.now()) {
  return isPro(user, now) ? PLANS.pro : PLANS.free;
}

export function extendPro(user, days, now = Date.now()) {
  const start = isPro(user, now) ? user.proUntil : now;
  return { ...user, proUntil: start + days * DAY_MS };
}

// "BTC", "btc", "BTCUSDT", "btc/usdt" -> "BTCUSDT"
export function normalizeSymbol(input, quote = "USDT") {
  const s = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return null;
  return s.endsWith(quote) && s.length > quote.length ? s : s + quote;
}

export function parseCommand(text) {
  const match = String(text || "").trim().match(/^\/([a-z_]+)(?:@\w+)?(?:\s+(.*))?$/i);
  if (!match) return null;
  return { cmd: match[1].toLowerCase(), args: (match[2] || "").split(/\s+/).filter(Boolean) };
}

// Symbols in `current` (array of { symbol, quoteAsset }) that were not in `known`.
export function findNewListings(known, current, quote = "USDT") {
  const seen = new Set(known);
  return current
    .filter((s) => s.quoteAsset === quote && !seen.has(s.symbol))
    .map((s) => s.symbol);
}

// A target fires once when price crosses it from the side it was set on.
export function makeTarget(symbol, price, currentPrice) {
  return { symbol, price, direction: currentPrice != null && price < currentPrice ? "below" : "above" };
}

export function targetHit(target, price) {
  return target.direction === "above" ? price >= target.price : price <= target.price;
}

// history: [{ t, prices: { SYMBOL: number } }] oldest first.
export function pushSnapshot(history, snapshot, windowMs) {
  return [...history, snapshot].filter((h) => h.t >= snapshot.t - windowMs);
}

// Symbols that moved at least `thresholdPct` between the oldest snapshot in the window and now.
export function findMoves(history, thresholdPct) {
  if (history.length < 2) return [];
  const first = history[0].prices;
  const last = history[history.length - 1].prices;
  const moves = [];
  for (const [symbol, price] of Object.entries(last)) {
    const before = first[symbol];
    if (!before) continue;
    const pct = ((price - before) / before) * 100;
    if (Math.abs(pct) >= thresholdPct) moves.push({ symbol, from: before, to: price, pct });
  }
  return moves.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}

export function formatPrice(n) {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return n.toPrecision(4);
}

export function tradeLink(symbol, inviteCode, quote = "USDT") {
  const base = symbol.endsWith(quote) ? symbol.slice(0, -quote.length) : symbol;
  const url = `https://www.mexc.com/exchange/${base}_${quote}`;
  return inviteCode ? `${url}?inviteCode=${encodeURIComponent(inviteCode)}` : url;
}

export function listingMessage(symbol, inviteCode) {
  return `🆕 New on MEXC: ${symbol}\n${tradeLink(symbol, inviteCode)}\n\nNot financial advice. New listings are very volatile.`;
}

export function moveMessage(move, minutes, inviteCode) {
  const arrow = move.pct > 0 ? "🚀" : "🔻";
  const sign = move.pct > 0 ? "+" : "";
  return `${arrow} ${move.symbol} ${sign}${move.pct.toFixed(1)}% in ${minutes} min\n${formatPrice(move.from)} → ${formatPrice(move.to)}\n${tradeLink(move.symbol, inviteCode)}`;
}

export function targetMessage(target, price, inviteCode) {
  return `🎯 ${target.symbol} hit ${formatPrice(target.price)} (now ${formatPrice(price)})\n${tradeLink(target.symbol, inviteCode)}`;
}

export const HELP = [
  "MEXC Alerts: new listings and price alerts.",
  "",
  "/alert BTC 70000  alert when BTC reaches 70,000",
  "/alerts  list your alerts",
  "/remove 1  delete alert #1",
  "/listings on|off  new-listing alerts (on by default)",
  "/price BTC  current price",
  "/upgrade  Pro: 50 alerts + big-move alerts",
  "/status  your plan",
].join("\n");
