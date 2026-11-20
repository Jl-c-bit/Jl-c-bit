// Pure, DOM-free logic for Tally. Everything here is unit-tested.
// Dates are "YYYY-MM-DD" strings so they compare and sort as text.

export const FY = { label: "2026–27", start: "2026-07-01", end: "2027-06-30" };

// 2026–27 resident rates (Stage 3, with the bottom rate cut to 15% from 1 July 2026).
export const BRACKETS = [
  { from: 0, rate: 0 },
  { from: 18200, rate: 0.15 },
  { from: 45000, rate: 0.30 },
  { from: 135000, rate: 0.37 },
  { from: 190000, rate: 0.45 },
];
export const MEDICARE = 0.02;

export function incomeTax(taxable) {
  const t = Math.max(0, Math.floor(taxable)); // ATO ignores cents of taxable income
  let tax = 0;
  for (let i = 0; i < BRACKETS.length; i++) {
    const lo = BRACKETS[i].from;
    const hi = i + 1 < BRACKETS.length ? BRACKETS[i + 1].from : Infinity;
    if (t > lo) tax += (Math.min(t, hi) - lo) * BRACKETS[i].rate;
  }
  return tax + t * MEDICARE;
}

export function marginalRate(taxable) {
  let rate = 0;
  for (const b of BRACKETS) if (taxable > b.from) rate = b.rate;
  return rate + MEDICARE;
}

// ---------- dates ----------

export function addYears(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y + n, m - 1, d));
  if (date.getUTCMonth() !== m - 1) date.setUTCDate(0); // 29 Feb -> 28 Feb
  return date.toISOString().slice(0, 10);
}

export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const t = (k) => Date.UTC(...k.split("-").map((v, i) => (i === 1 ? v - 1 : +v)));
  return Math.round((t(b) - t(a)) / 86400000);
}

// The 50% discount needs the asset held for at least 12 months, not counting
// the days you bought and sold it. So the first eligible sale date is one year
// and one day after purchase.
export function discountDate(bought) {
  return addDays(addYears(bought, 1), 1);
}

export function isDiscountable(bought, sold) {
  return !!bought && !!sold && sold >= discountDate(bought);
}

export function inFY(date) {
  return !!date && date >= FY.start && date <= FY.end;
}

// Accepts 2026-08-14, 2026/08/14, 14/08/2026 (Australian day-first),
// 14-08-2026, "14 Aug 2026", with or without a time after it.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // clearly month-first
    return ymd(y, mo, d);
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return ymd(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) return ymd(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  return null;
}

function ymd(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

// ---------- the CGT calculation ----------

export function gainOf(t) {
  return (Number(t.proceeds) || 0) - (Number(t.cost) || 0);
}

// trades: [{ bought, sold, cost, proceeds }]
// Losses (this year's, then carried-forward) go against non-discountable gains
// first, then discountable gains; the 50% discount applies to what's left.
export function calculate({ trades = [], otherIncome = 0, carriedLosses = 0 } = {}) {
  let shortGains = 0, longGains = 0, currentLosses = 0;
  for (const t of trades) {
    const g = gainOf(t);
    if (g < 0) currentLosses += -g;
    else if (isDiscountable(t.bought, t.sold)) longGains += g;
    else shortGains += g;
  }
  const totalGains = shortGains + longGains;
  const lossesAvailable = currentLosses + Math.max(0, Number(carriedLosses) || 0);

  const offShort = Math.min(lossesAvailable, shortGains);
  const offLong = Math.min(lossesAvailable - offShort, longGains);
  const lossesUsed = offShort + offLong;
  const lossesToCarry = lossesAvailable - lossesUsed;

  const shortLeft = shortGains - offShort;
  const longLeft = longGains - offLong;
  const discount = longLeft / 2;
  const netCapitalGain = shortLeft + longLeft - discount;

  const income = Math.max(0, Number(otherIncome) || 0);
  const baseTax = incomeTax(income);
  const extraTax = incomeTax(income + netCapitalGain) - baseTax;
  const taxWithoutDiscount = incomeTax(income + shortLeft + longLeft) - baseTax;

  return {
    shortGains, longGains, totalGains, currentLosses,
    lossesUsed, lossesToCarry,
    discount, netCapitalGain,
    extraTax, discountSaved: taxWithoutDiscount - extraTax,
    marginal: marginalRate(income + netCapitalGain),
  };
}

// ---------- sell now or wait ----------

// Compares selling a holding today against holding until it qualifies for the
// discount. `baseGain` is the net capital gain you already have this year, so
// the new gain is taxed at the right marginal rate.
export function sellOrWait({ bought, cost, value, today, otherIncome = 0, baseGain = 0 }) {
  const c = Number(cost) || 0, v = Number(value) || 0;
  const base = Math.max(0, Number(otherIncome) || 0) + Math.max(0, Number(baseGain) || 0);
  const taxOn = (gain) => incomeTax(base + Math.max(0, gain)) - incomeTax(base);
  const eligible = discountDate(bought);
  const daysLeft = Math.max(0, daysBetween(today, eligible));
  const gain = v - c;

  const taxNow = daysLeft > 0 ? taxOn(gain) : taxOn(gain / 2);
  const taxLater = taxOn(gain / 2);
  const keepNow = v - taxNow;

  // Lowest value at the eligible date where waiting still leaves you with as
  // much after tax as selling today. Value after tax rises with price, so bisect.
  let breakEven = null;
  if (daysLeft > 0 && gain > 0) {
    let lo = 0, hi = v;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (mid - taxOn((mid - c) / 2) >= keepNow) hi = mid; else lo = mid;
    }
    breakEven = hi;
  }

  return {
    gain, eligible, daysLeft,
    alreadyEligible: daysLeft === 0,
    taxNow, taxLater, saving: taxNow - taxLater,
    keepNow, keepLater: v - taxLater,
    breakEven,
    breakEvenDrop: breakEven == null || v === 0 ? null : 1 - breakEven / v,
  };
}

// ---------- CSV import ----------

export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text).replace(/^﻿/, "");
  const delim = guessDelimiter(src);
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function guessDelimiter(src) {
  const first = src.split(/\r?\n/, 1)[0] || "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ",";
}

export function num(raw) {
  if (raw == null) return NaN;
  const s = String(raw).replace(/[^0-9.\-eE]/g, "");
  return s === "" ? NaN : Number(s);
}

const FIATS = ["AUD", "USD", "USDT", "USDC", "NZD", "EUR", "GBP"];

// "BTC/AUD", "BTC-AUD", "BTCAUD", "BTC" -> { base: "BTC", quote: "AUD" | null }
export function splitPair(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return { base: "", quote: null };
  const parts = s.split(/[\/\-_: ]+/).filter(Boolean);
  if (parts.length >= 2) return { base: parts[0], quote: parts[1] };
  for (const q of FIATS) if (s.length > q.length && s.endsWith(q)) return { base: s.slice(0, -q.length), quote: q };
  return { base: s, quote: null };
}

// Header names seen across CoinSpot, Swyftx, Independent Reserve, Binance,
// Kraken, CoinJar and generic exports. First match wins.
const COLS = {
  date: [/^date/, /transaction date/, /^time/, /timestamp/, /created/, /^when/],
  type: [/^type$/, /^side$/, /order type/, /^event/, /transaction type/, /^action/, /^direction/, /^type/],
  pair: [/^market$/, /^pair$/, /^symbol$/, /trading pair/, /^instrument/],
  asset: [/^asset$/, /^coin$/, /^currency$/, /^crypto/, /primary currency/, /^token/, /^asset/, /^coin/],
  qty: [/^executed$/, /^amount$/, /^quantity$/, /^qty/, /^volume/, /^units/, /^amount \(?(coin|crypto)/, /^amount/, /^filled/],
  aud: [/total.*aud.*inc/, /total \(?aud\)?$/, /^total aud/, /aud (value|amount|total)/, /value \(?aud\)?/, /^total$/, /^value$/, /cost.*aud/, /^amount \(?aud\)?$/, /^aud/, /^total/, /^amount$/],
  fee: [/fee.*aud/, /^fee$/, /^fees$/, /brokerage/],
};

function findCol(headers, key, taken) {
  for (const re of COLS[key]) {
    const i = headers.findIndex((h, idx) => !taken.has(idx) && re.test(h));
    if (i !== -1) return i;
  }
  return -1;
}

export function mapColumns(headerRow) {
  const headers = headerRow.map((h) => String(h).trim().toLowerCase());
  const taken = new Set();
  const out = {};
  for (const key of ["date", "type", "pair", "asset", "fee", "qty", "aud"]) {
    out[key] = findCol(headers, key, taken);
    if (out[key] !== -1) taken.add(out[key]);
  }
  return out;
}

function sideOf(raw) {
  const s = String(raw || "").toLowerCase();
  if (/sell|sold|disposal|withdraw.*sell|instant sell/.test(s)) return "sell";
  if (/buy|bought|purchase|instant buy/.test(s)) return "buy";
  return null;
}

// Turns exchange CSV text into buy/sell events in AUD.
export function eventsFromCSV(text) {
  const rows = parseCSV(text);
  const warnings = [];
  if (rows.length < 2) return { events: [], warnings: ["The file has no trade rows."] };
  const col = mapColumns(rows[0]);
  const missing = ["date", "type", "qty", "aud"].filter((k) => col[k] === -1);
  if (col.pair === -1 && col.asset === -1) missing.push("coin");
  if (missing.length) {
    return { events: [], warnings: [`Couldn't find these columns: ${missing.join(", ")}. Check the first row has headers.`] };
  }
  const events = [];
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const date = parseDate(row[col.date]);
    const side = sideOf(row[col.type]);
    let coin = "", quote = null;
    if (col.pair !== -1) ({ base: coin, quote } = splitPair(row[col.pair]));
    if (!coin && col.asset !== -1) coin = String(row[col.asset] || "").trim().toUpperCase();
    const qty = Math.abs(num(row[col.qty]));
    let aud = Math.abs(num(row[col.aud]));
    const feeRaw = col.fee === -1 ? "" : String(row[col.fee] || "");
    // Only count fees charged in AUD (Binance lists fees in the coin itself).
    const fee = /[a-z]/i.test(feeRaw.replace(/aud/i, "")) ? 0 : Math.abs(num(feeRaw)) || 0;
    if (!date || !side || !coin || !(qty > 0) || !(aud >= 0)) { skipped++; continue; }
    if (quote && quote !== "AUD") { skipped++; continue; }
    if (FIATS.includes(coin)) { skipped++; continue; }
    // Fees add to what you paid and come off what you received.
    aud = side === "buy" ? aud + fee : Math.max(0, aud - fee);
    events.push({ date, side, coin, qty, aud, row: r + 1 });
  }
  if (skipped) warnings.push(`Skipped ${skipped} row${skipped === 1 ? "" : "s"} that weren't AUD buys or sells (deposits, withdrawals, crypto-to-crypto pairs). Add swaps by hand.`);
  return { events, warnings };
}

// First-in, first-out: each sell eats the oldest buys of that coin.
// Returns one disposal per (sell, lot) so each part gets the right discount.
export function matchFIFO(events, { onlyFY = true } = {}) {
  const sorted = [...events].sort((a, b) =>
    a.date === b.date ? (a.side === b.side ? a.row - b.row : a.side === "buy" ? -1 : 1) : a.date < b.date ? -1 : 1);
  const lots = {};
  const disposals = [];
  const warnings = [];
  for (const e of sorted) {
    const q = (lots[e.coin] ||= []);
    if (e.side === "buy") { q.push({ date: e.date, qty: e.qty, cost: e.aud }); continue; }
    let left = e.qty;
    const unit = e.aud / e.qty;
    while (left > 1e-12 && q.length) {
      const lot = q[0];
      const take = Math.min(left, lot.qty);
      const cost = lot.cost * (take / lot.qty);
      lot.cost -= cost; lot.qty -= take; left -= take;
      if (lot.qty <= 1e-12) q.shift();
      if (!onlyFY || inFY(e.date)) disposals.push({ coin: e.coin, bought: lot.date, sold: e.date, cost: round2(cost), proceeds: round2(unit * take) });
    }
    if (left > 1e-9 && (!onlyFY || inFY(e.date))) {
      warnings.push(`${e.coin} sale on ${e.date}: ${trim(left)} ${e.coin} had no matching buy in the file. Its cost is set to $0, so fix it by hand.`);
      disposals.push({ coin: e.coin, bought: "", sold: e.date, cost: 0, proceeds: round2(unit * left), unmatched: true });
    }
  }
  return { disposals, warnings };
}

export function importCSV(text) {
  const parsed = eventsFromCSV(text);
  const fifo = matchFIFO(parsed.events);
  return { disposals: fifo.disposals, warnings: [...parsed.warnings, ...fifo.warnings], events: parsed.events.length };
}

function round2(n) { return Math.round(n * 100) / 100; }
function trim(n) { return String(+n.toFixed(8)); }

// ---------- summary text ----------

export function money(n) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString("en-AU")}`;
}

export function summaryText(trades, r, { otherIncome = 0, carriedLosses = 0 } = {}) {
  const lines = [
    `Tally crypto tax estimate, ${FY.label}`,
    `Other taxable income: ${money(otherIncome)}`,
    carriedLosses > 0 ? `Carried-forward losses: ${money(carriedLosses)}` : null,
    `Disposals: ${trades.length}`,
    `Total gains: ${money(r.totalGains)} (${money(r.longGains)} held 12+ months)`,
    `Losses used: ${money(r.lossesUsed)}`,
    `50% discount: ${money(r.discount)}`,
    `Net capital gain: ${money(r.netCapitalGain)}`,
    `Extra tax (est.): ${money(r.extraTax)}`,
    r.lossesToCarry > 0 ? `Losses to carry forward: ${money(r.lossesToCarry)}` : null,
    "",
    "Estimate only, not tax advice.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}
