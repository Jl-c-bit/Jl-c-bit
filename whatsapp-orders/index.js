// Entry point: `WHATSAPP_TOKEN=... VERIFY_TOKEN=... APP_SECRET=... node index.js`
import fs from "node:fs";
import { createSender, startServer } from "./server.js";

// Hosts without file uploads (e.g. Railway) can pass the whole list in BUSINESSES_JSON instead.
const businessesFile = process.env.BUSINESSES_FILE || "businesses.json";
if (!process.env.BUSINESSES_JSON && !fs.existsSync(businessesFile)) {
  console.error(`Missing ${businessesFile} (or set BUSINESSES_JSON). Copy businesses.example.json to get started.`);
  process.exit(1);
}
if (!process.env.VERIFY_TOKEN) {
  console.error("Set VERIFY_TOKEN (any secret string; you paste the same one into the Meta webhook settings).");
  process.exit(1);
}
if (!process.env.APP_SECRET) console.warn("APP_SECRET not set: webhook signatures are NOT being checked.");

const businesses = JSON.parse(process.env.BUSINESSES_JSON || fs.readFileSync(businessesFile, "utf8"));
const port = Number(process.env.PORT || 3000);

startServer(
  {
    businesses,
    sendText: createSender(process.env.WHATSAPP_TOKEN),
    ordersDir: process.env.ORDERS_DIR || "orders",
    appSecret: process.env.APP_SECRET,
    verifyToken: process.env.VERIFY_TOKEN,
  },
  port,
);
console.log(`OrderTap: WhatsApp ordering for ${businesses.length} business(es) on :${port}`);
