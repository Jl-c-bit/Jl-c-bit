// Billing helper. Restart the server after changes.
//   node admin.js list
//   node admin.js extend <businessId> <days>   (run when a client pays their monthly fee)
import fs from "node:fs";
import { isActive } from "./core.js";

const file = process.env.BUSINESSES_FILE || "businesses.json";
const businesses = JSON.parse(fs.readFileSync(file, "utf8"));
const [cmd, id, days] = process.argv.slice(2);

if (cmd === "list") {
  for (const b of businesses) console.log(`${isActive(b) ? "ACTIVE " : "PAUSED "} ${b.id.padEnd(20)} paid until ${b.paidUntil || "-"}  ${b.plan || ""}`);
} else if (cmd === "extend" && id && Number(days) > 0) {
  const b = businesses.find((x) => x.id === id);
  if (!b) throw new Error(`No business "${id}"`);
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date((b.paidUntil && b.paidUntil > today ? b.paidUntil : today) + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() + Number(days));
  b.paidUntil = start.toISOString().slice(0, 10);
  fs.writeFileSync(file, JSON.stringify(businesses, null, 2) + "\n");
  console.log(`${b.id} now paid until ${b.paidUntil}`);
} else {
  console.log("Usage: node admin.js list | extend <businessId> <days>");
}
