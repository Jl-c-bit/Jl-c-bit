import { test } from "node:test";
import assert from "node:assert/strict";
import {
  incomeTax, marginalRate, discountDate, isDiscountable, parseDate, calculate,
  sellOrWait, parseCSV, splitPair, eventsFromCSV, matchFIFO, importCSV, summaryText,
} from "../core.js";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("incomeTax uses 2026–27 brackets plus 2% Medicare", () => {
  assert.equal(incomeTax(18200), 18200 * 0.02);
  near(incomeTax(45000), 26800 * 0.15 + 45000 * 0.02);
  near(incomeTax(135000), 4020 + 27000 + 135000 * 0.02);
  near(incomeTax(190000), 4020 + 27000 + 20350 + 190000 * 0.02);
  near(incomeTax(200000), 4020 + 27000 + 20350 + 4500 + 200000 * 0.02);
  assert.equal(incomeTax(-5), 0);
});

test("marginalRate includes Medicare", () => {
  near(marginalRate(10000), 0.02);
  near(marginalRate(90000), 0.32);
  near(marginalRate(250000), 0.47);
});

test("discount needs 12 months not counting buy and sell days", () => {
  assert.equal(discountDate("2025-07-01"), "2026-07-02");
  assert.equal(isDiscountable("2025-07-01", "2026-07-01"), false);
  assert.equal(isDiscountable("2025-07-01", "2026-07-02"), true);
  assert.equal(discountDate("2024-02-29"), "2025-03-01");
});

test("parseDate reads Australian and ISO formats", () => {
  assert.equal(parseDate("2026-08-14 10:22:01"), "2026-08-14");
  assert.equal(parseDate("14/08/2026 10:22"), "2026-08-14");
  assert.equal(parseDate("08/14/2026"), "2026-08-14");
  assert.equal(parseDate("14 Aug 2026"), "2026-08-14");
  assert.equal(parseDate("Aug 14, 2026"), "2026-08-14");
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseDate("nope"), null);
});

test("calculate applies losses to short-term gains first, then discount", () => {
  const trades = [
    { bought: "2026-08-01", sold: "2026-09-01", cost: 1000, proceeds: 5000 }, // short +4000
    { bought: "2024-01-01", sold: "2026-10-01", cost: 2000, proceeds: 12000 }, // long +10000
    { bought: "2026-07-05", sold: "2026-11-01", cost: 3000, proceeds: 1000 }, // loss -2000
  ];
  const r = calculate({ trades, otherIncome: 90000, carriedLosses: 3000 });
  assert.equal(r.totalGains, 14000);
  assert.equal(r.lossesUsed, 5000);
  // 4000 short wiped, 1000 off the long gain -> 9000, halved to 4500
  assert.equal(r.discount, 4500);
  assert.equal(r.netCapitalGain, 4500);
  near(r.extraTax, 4500 * 0.32);
  near(r.discountSaved, 4500 * 0.32);
  assert.equal(r.lossesToCarry, 0);
});

test("calculate carries forward unused losses", () => {
  const r = calculate({ trades: [{ bought: "2026-07-02", sold: "2026-08-01", cost: 500, proceeds: 100 }], carriedLosses: 50 });
  assert.equal(r.netCapitalGain, 0);
  assert.equal(r.lossesToCarry, 450);
  assert.equal(r.extraTax, 0);
});

test("sellOrWait finds the saving and break-even price", () => {
  const r = sellOrWait({ bought: "2026-01-10", cost: 10000, value: 30000, today: "2026-11-20", otherIncome: 90000 });
  assert.equal(r.eligible, "2027-01-11");
  assert.equal(r.daysLeft, 52);
  near(r.taxNow, 20000 * 0.32);
  near(r.taxLater, 10000 * 0.32);
  near(r.saving, 3200);
  // At break-even, keeping after tax matches selling now.
  const after = r.breakEven - (r.breakEven - 10000) / 2 * 0.32;
  near(after, r.keepNow, 0.5);
  assert.ok(r.breakEvenDrop > 0 && r.breakEvenDrop < 0.2);
});

test("sellOrWait says when a holding already qualifies", () => {
  const r = sellOrWait({ bought: "2024-01-01", cost: 1, value: 2, today: "2026-11-20" });
  assert.equal(r.alreadyEligible, true);
  assert.equal(r.saving, 0);
  assert.equal(r.breakEven, null);
});

test("parseCSV handles quotes, CRLF, semicolons and BOM", () => {
  assert.deepEqual(parseCSV('﻿a,b\r\n"1,000","say ""hi"""\r\n'), [["a", "b"], ["1,000", 'say "hi"']]);
  assert.deepEqual(parseCSV("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
});

test("splitPair understands common market formats", () => {
  assert.deepEqual(splitPair("BTC/AUD"), { base: "BTC", quote: "AUD" });
  assert.deepEqual(splitPair("ethaud"), { base: "ETH", quote: "AUD" });
  assert.deepEqual(splitPair("SOL"), { base: "SOL", quote: null });
});

const COINSPOT = `Transaction Date,Type,Market,Amount,Rate inc. fee,Rate ex. fee,Fee,Fee AUD (inc GST),GST AUD,Total AUD,Total (inc GST)
01/03/2025 10:00 AM,Buy,BTC/AUD,0.1,90000,89100,10,10,0.91,9000,9000 AUD
15/09/2025 10:00 AM,Buy,BTC/AUD,0.1,100000,99000,10,10,0.91,10000,10000 AUD
10/08/2026 10:00 AM,Sell,BTC/AUD,0.15,150000,151500,20,20,1.82,22500,22500 AUD
12/08/2026 10:00 AM,Sell,ETH/BTC,1,0.05,0.05,0,0,0,0,0.05 BTC`;

test("CoinSpot export: FIFO split into a discount part and a short part", () => {
  const { disposals, warnings } = importCSV(COINSPOT);
  assert.equal(disposals.length, 2);
  const [a, b] = disposals;
  assert.equal(a.bought, "2025-03-01");
  assert.equal(a.sold, "2026-08-10");
  near(a.cost, 9010);                    // 0.1 lot + fee
  near(a.proceeds, (22500 - 20) * (0.1 / 0.15));
  assert.equal(b.bought, "2025-09-15");
  near(b.cost, 10010 / 2);
  assert.ok(isDiscountable(a.bought, a.sold));
  assert.ok(!isDiscountable(b.bought, b.sold));
  assert.ok(warnings.some((w) => /Skipped 1 row/.test(w)));
});

test("Binance style export with suffixed amounts", () => {
  const csv = `Date(UTC),Pair,Side,Price,Executed,Amount,Fee
2026-07-01 09:00:00,SOLAUD,BUY,200,10SOL,2000AUD,0.01SOL
2026-12-01 09:00:00,SOLAUD,SELL,300,4SOL,1200AUD,1.2AUD`;
  const { disposals } = importCSV(csv);
  assert.equal(disposals.length, 1);
  near(disposals[0].cost, 800);
  // fee column isn't AUD-labelled here, so "1.2AUD" -> 1.2 comes off proceeds
  near(disposals[0].proceeds, 1198.8);
});

test("sells outside the year eat lots but aren't reported", () => {
  const events = [
    { date: "2025-01-01", side: "buy", coin: "ETH", qty: 2, aud: 6000, row: 2 },
    { date: "2026-03-01", side: "sell", coin: "ETH", qty: 1, aud: 5000, row: 3 },
    { date: "2026-08-01", side: "sell", coin: "ETH", qty: 1, aud: 7000, row: 4 },
  ];
  const { disposals } = matchFIFO(events);
  assert.equal(disposals.length, 1);
  assert.equal(disposals[0].cost, 3000);
  assert.equal(disposals[0].proceeds, 7000);
});

test("unmatched sells are flagged with zero cost", () => {
  const { disposals, warnings } = matchFIFO([{ date: "2026-08-01", side: "sell", coin: "XRP", qty: 100, aud: 300, row: 2 }]);
  assert.equal(disposals[0].unmatched, true);
  assert.equal(disposals[0].cost, 0);
  assert.equal(warnings.length, 1);
});

test("missing columns give a clear message", () => {
  const { warnings, events } = eventsFromCSV("foo,bar\n1,2");
  assert.equal(events.length, 0);
  assert.match(warnings[0], /Couldn't find these columns/);
});

test("summaryText lists the key numbers", () => {
  const r = calculate({ trades: [{ bought: "2026-07-02", sold: "2026-08-01", cost: 100, proceeds: 1100 }], otherIncome: 60000 });
  const s = summaryText([{}], r, { otherIncome: 60000 });
  assert.match(s, /Net capital gain: \$1,000/);
  assert.match(s, /Extra tax \(est\.\): \$320/);
});
