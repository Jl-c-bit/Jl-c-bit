// MEXC public market data (no API key needed).
const BASE = "https://api.mexc.com/api/v3";

async function get(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`MEXC ${path} -> HTTP ${res.status}`);
  return res.json();
}

// [{ symbol, quoteAsset }]
export async function getSymbols() {
  const info = await get("/exchangeInfo");
  return info.symbols.map((s) => ({ symbol: s.symbol, quoteAsset: s.quoteAsset }));
}

// { SYMBOL: price }
export async function getPrices() {
  const list = await get("/ticker/price");
  const prices = {};
  for (const { symbol, price } of list) prices[symbol] = Number(price);
  return prices;
}
