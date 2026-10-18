// Billing and privacy helper. Restart the server after billing changes.
//   node admin.js list
//   node admin.js extend <businessId> <days>   (run when a client pays their monthly fee)
//   node admin.js forget <phone>               (delete a customer's orders on request)
import fs from "node:fs";
import { isActive } from "./core.js";
import { forgetCustomer } from "./privacy.js";

const file = process.env.BUSINESSES_FILE || "businesses.json";
const loadBusinesses = () => JSON.parse(process.env.BUSINESSES_JSON || fs.readFileSync(file, "utf8"));
const [cmd, id, days] = process.argv.slice(2);

if (cmd === "list") {
  for (const b of loadBusinesses()) console.log(`${isActive(b) ? "ACTIVE " : "PAUSED "} ${b.id.padEnd(20)} paid until ${b.paidUntil || "-"}  ${b.plan || ""}`);
} else if (cmd === "extend" && id && Number(days) > 0) {
  if (process.env.BUSINESSES_JSON) throw new Error("Using BUSINESSES_JSON: edit paidUntil in that variable instead.");
  const businesses = loadBusinesses();
  const b = businesses.find((x) => x.id === id);
  if (!b) throw new Error(`No business "${id}"`);
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date((b.paidUntil && b.paidUntil > today ? b.paidUntil : today) + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() + Number(days));
  b.paidUntil = start.toISOString().slice(0, 10);
  fs.writeFileSync(file, JSON.stringify(businesses, null, 2) + "\n");
  console.log(`${b.id} now paid until ${b.paidUntil}`);
} else if (cmd === "forget" && id) {
  const ordersDir = process.env.ORDERS_DIR || "orders";
  const removed = forgetCustomer(ordersDir, id);
  const entries = Object.entries(removed);
  if (!entries.length) console.log(`No orders found for ${id} in ${ordersDir}.`);
  for (const [business, n] of entries) console.log(`${business}: removed ${n} order(s)`);
} else {
  console.log("Usage: node admin.js list | extend <businessId> <days> | forget <phone>");
}
