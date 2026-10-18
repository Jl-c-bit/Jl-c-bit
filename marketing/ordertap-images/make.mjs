// Renders the OrderTap social cards in cards.html to PNGs.
//
//   npm install && node make.mjs
//
// Each <section id="..."> becomes ../../ordertap-site/social/<id>.png, served at
// /ordertap/social/<id>.png once merged. That public URL is what Metricool downloads.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "../../ordertap-site/social");
const CHROME = process.env.CHROME || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
await page.goto(pathToFileURL(path.join(HERE, "cards.html")).href);
await page.evaluate(() => document.fonts.ready);

for (const id of await page.$$eval("section[id]", (els) => els.map((e) => e.id))) {
  await page.locator(`#${id}`).screenshot({ path: path.join(OUT, `${id}.png`) });
  console.log(`ordertap-site/social/${id}.png`);
}
await browser.close();
