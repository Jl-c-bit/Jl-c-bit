// -----------------------------------------------------------------------------
// Turns a list of Stripe charges into the numbers the dashboard shows.
//
// Used by the /dashboard/api/stats function. The output is public, so it holds
// only totals, dates, amounts and countries: never names, emails or card details.
// -----------------------------------------------------------------------------
export const DAYS = 90;
const DAY_MS = 864e5;

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Net amount actually kept from a charge, in the smallest currency unit. */
const net = (c) => (c.amount_captured ?? c.amount) - (c.amount_refunded || 0);

/**
 * @param {object[]} charges  Stripe charge objects (any order, any status)
 * @param {number}   now      current time in ms
 */
export function summarizeCharges(charges, now = Date.now()) {
  const paid = charges.filter((c) => c.status === "succeeded" && c.paid && !c.refunded && net(c) > 0);

  // Charges can be in several currencies. Report the main one; sums across currencies are meaningless.
  const byCurrency = {};
  for (const c of paid) byCurrency[c.currency] = (byCurrency[c.currency] || 0) + 1;
  const currency = Object.keys(byCurrency).sort((a, b) => byCurrency[b] - byCurrency[a])[0] || "usd";
  const sales = paid.filter((c) => c.currency === currency).sort((a, b) => b.created - a.created);

  const today = Date.parse(dayKey(now));
  const daily = Array.from({ length: DAYS }, (_, i) => ({ day: dayKey(today - (DAYS - 1 - i) * DAY_MS), amount: 0, orders: 0 }));
  const index = Object.fromEntries(daily.map((d, i) => [d.day, i]));

  let revenue = 0, last30 = 0, prev30 = 0, orders30 = 0, prevOrders30 = 0;
  const customers = new Set(), countries = {};
  for (const c of sales) {
    const ms = c.created * 1000, amount = net(c);
    revenue += amount;
    const i = index[dayKey(ms)];
    if (i !== undefined) { daily[i].amount += amount; daily[i].orders += 1; }
    const age = now - ms;
    if (age < 30 * DAY_MS) { last30 += amount; orders30 += 1; }
    else if (age < 60 * DAY_MS) { prev30 += amount; prevOrders30 += 1; }
    const who = c.customer || c.billing_details?.email || c.payment_method_details?.card?.fingerprint;
    if (who) customers.add(who);
    const country = c.billing_details?.address?.country || c.payment_method_details?.card?.country;
    if (country) countries[country] = (countries[country] || 0) + amount;
  }

  const first = sales.length ? sales[sales.length - 1].created * 1000 : null;
  return {
    currency,
    revenue,
    orders: sales.length,
    last30, prev30, orders30, prevOrders30,
    averageOrder: sales.length ? Math.round(revenue / sales.length) : 0,
    customers: customers.size,
    firstSale: first ? dayKey(first) : null,
    daily,
    countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([code, amount]) => ({ code, amount })),
    recent: sales.slice(0, 6).map((c) => ({
      ref: c.id.slice(-6).toUpperCase(),
      amount: net(c),
      created: c.created * 1000,
      country: c.billing_details?.address?.country || c.payment_method_details?.card?.country || null,
      item: (c.description || "").slice(0, 60) || null,
    })),
    otherCurrencies: Object.keys(byCurrency).filter((k) => k !== currency),
  };
}
