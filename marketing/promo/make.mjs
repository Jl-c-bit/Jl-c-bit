// Makes 1080x1920 promo videos of PrivatePDF for TikTok/Reels/Shorts.
//
//   npm install && node make.mjs            # every video in videos.json
//   node make.mjs split compress            # only these ids
//
// For each video it serves ../../privatepdf locally, runs the real tool in a
// phone-sized Chromium, screenshots three steps, lays captions over them, and
// stitches hook + steps + end card into an MP4 at ../../privatepdf/promo/<id>.mp4
// (served at /pdf/promo/<id>.mp4 once merged).
import { chromium } from "playwright";
import ffmpeg from "ffmpeg-static";
import { PDFDocument, StandardFonts, rgb } from "../../privatepdf/assets/vendor/pdf-lib.esm.min.js";
import { execFileSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, "../../privatepdf");
const WORK = path.join(HERE, "work");
const OUT = path.join(SITE, "promo");
const CHROME = process.env.CHROME || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const videos = JSON.parse(fs.readFileSync(path.join(HERE, "videos.json"), "utf8"));
const only = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(path.join(WORK, "samples"), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// ---------- Local server: /pdf/* -> privatepdf/ ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!url.startsWith("/pdf/")) { res.writeHead(404); return res.end(); }
  let file = path.join(SITE, url.slice(5));
  if (!file.startsWith(SITE)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------- Sample files ----------
async function samplePdf(name, title, pages, photo) {
  const file = path.join(WORK, "samples", name);
  if (fs.existsSync(file)) return file;
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica), b = await doc.embedFont(StandardFonts.HelveticaBold);
  const img = photo ? await doc.embedJpg(fs.readFileSync(photo)) : null;
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(title, { x: 50, y: 780, size: 22, font: b });
    p.drawText(`Page ${i + 1} of ${pages}`, { x: 50, y: 755, size: 11, font: f, color: rgb(0.4, 0.4, 0.4) });
    if (img) p.drawImage(img, { x: 50, y: 120, width: 495, height: 600 });
    else for (let r = 0; r < 28; r++) p.drawText(`${String(r + 1).padStart(2, "0")}  Item ${1000 + r * 7}   $${(r * 13.37 + 4).toFixed(2)}`, { x: 50, y: 710 - r * 22, size: 11, font: f });
  }
  fs.writeFileSync(file, await doc.save());
  return file;
}

const browser = await chromium.launch({ executablePath: CHROME });

async function receipts() {
  const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
  const out = [];
  for (const [i, store] of [[1, "CORNER CAFE"], [2, "HARDWARE PLUS"], [3, "CITY TAXI"]]) {
    const file = path.join(WORK, "samples", `receipt-${i}.jpg`);
    out.push(file);
    if (fs.existsSync(file)) continue;
    await page.setContent(`<body style="margin:0;background:#c9b79c;display:grid;place-items:center;height:800px;font-family:monospace">
      <div style="background:#fbfaf6;width:380px;padding:30px;transform:rotate(${i * 2 - 4}deg);box-shadow:0 10px 30px #0004;font-size:18px">
      <h2 style="text-align:center">${store}</h2><p>08/10/2026 12:4${i}</p><hr>
      ${[1, 2, 3, 4].map((k) => `<p>Item ${k} <span style="float:right">$${(k * i * 3.5).toFixed(2)}</span></p>`).join("")}<hr>
      <p><b>TOTAL <span style="float:right">$${(35 * i).toFixed(2)}</span></b></p></div></body>`);
    await page.screenshot({ path: file, type: "jpeg", quality: 85 });
  }
  await page.close();
  return out;
}

// A big, photo-heavy "scan" so compression has something to shrink.
async function scanPhoto() {
  const file = path.join(WORK, "samples", "scan-page.jpg");
  if (fs.existsSync(file)) return file;
  const page = await browser.newPage({ viewport: { width: 1700, height: 2200 } });
  await page.setContent(`<body style="margin:0"><canvas id="c" width="1700" height="2200"></canvas><script>
    const c = document.getElementById("c").getContext("2d"), img = c.createImageData(1700, 2200);
    for (let i = 0; i < img.data.length; i += 4) { const v = 225 + Math.random() * 30; img.data[i] = v; img.data[i + 1] = v - 4; img.data[i + 2] = v - 12; img.data[i + 3] = 255; }
    c.putImageData(img, 0, 0); c.fillStyle = "#222"; c.font = "bold 70px serif"; c.fillText("SERVICE AGREEMENT", 300, 220);
    c.font = "38px serif"; for (let r = 0; r < 38; r++) c.fillText("The parties agree to the terms set out in clause " + (r + 1) + " of this agreement.", 140, 360 + r * 48);
  </script></body>`);
  await page.screenshot({ path: file, type: "jpeg", quality: 95 });
  await page.close();
  return file;
}

const SAMPLES = {
  bank: () => samplePdf("Bank-statement-March.pdf", "Bank statement - March", 3),
  lease: () => samplePdf("Lease-agreement.pdf", "Residential lease agreement", 4),
  tax: () => samplePdf("Tax-return-2026.pdf", "Tax return 2026", 6),
  scan: async () => samplePdf("Scanned-contract.pdf", "Scanned contract", 4, await scanPhoto()),
  receipts: receipts,
};

// ---------- Screenshots of the real tool ----------
async function shoot(v) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 760 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const shots = [];
  const snap = async () => { const f = path.join(WORK, `${v.id}-${shots.length + 1}.png`); await p.screenshot({ path: f }); shots.push(f); };
  await p.goto(`${BASE}/pdf/${v.tool}/`); await p.waitForLoadState("networkidle"); await wait(500);
  await snap();
  const inputs = (await Promise.all(v.inputs.map((k) => SAMPLES[k]()))).flat();
  await p.setInputFiles("#file-input", inputs); await wait(1000);
  if (v.pages) await p.fill("#pages", v.pages);
  if (v.choose) await p.check(`input[value="${v.choose}"]`);
  await p.evaluate(() => (document.querySelector("#options:not([hidden])") || document.querySelector("#file-list")).scrollIntoView({ block: "center" }));
  await wait(300); await snap();
  await p.click("#run"); await p.waitForSelector("#results:not([hidden])", { timeout: 60000 }); await wait(800);
  await p.evaluate(() => document.querySelector("#results").scrollIntoView({ block: "center" })); await wait(400);
  await snap();
  await ctx.close();
  return shots;
}

// ---------- Scenes with captions ----------
const CSS = `body{margin:0;width:1080px;height:1920px;overflow:hidden;font-family:"DejaVu Sans",sans-serif;color:#fff;
 background:radial-gradient(120% 80% at 50% 0%,#3a52e0 0%,#1b2585 60%,#121a5c 100%)}
 .cap{position:absolute;left:70px;right:70px;top:120px;font-weight:800;font-size:68px;line-height:1.12;letter-spacing:-1px;text-align:center}
 mark{background:#ffd54a;color:#121a5c;padding:0 12px;border-radius:12px;-webkit-box-decoration-break:clone}
 .phone{position:absolute;left:50%;top:480px;width:740px;transform:translateX(-50%);border-radius:64px;border:18px solid #0b0f2e;overflow:hidden;box-shadow:0 40px 90px rgba(0,0,0,.5);background:#f5f4ef}
 .phone img{display:block;width:100%}
 .hook{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:0 80px;gap:40px;text-align:center}
 .hook h1{font-size:96px;line-height:1.08;margin:0;letter-spacing:-2px}
 .hook p{font-size:46px;margin:0;opacity:.85;font-weight:700}
 .url{display:inline-block;background:#fff;color:#1b2585;font-weight:800;font-size:52px;padding:22px 40px;border-radius:24px}`;
const LOCK = `<svg width="170" height="170" viewBox="0 0 24 24" fill="none" stroke="#ffd54a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
const END = `<div class="hook">${LOCK}<h1>PrivatePDF</h1><p>Free. No sign-up.<br>Your files never leave your phone.</p><div><span class="url">Link in bio</span></div></div>`;
const hl = (s) => s.replace(/\*([^*]+)\*/g, "<mark>$1</mark>");

async function scenes(v, shots) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const img = (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
  const bodies = [
    `<div class="hook">${LOCK}<h1>${hl(v.hook)}</h1>${v.sub ? `<p>${hl(v.sub)}</p>` : ""}</div>`,
    ...v.steps.map((cap, i) => `<div class="cap">${hl(cap)}</div><div class="phone"><img src="${img(shots[i])}"></div>`),
    END,
  ];
  const files = [];
  for (let i = 0; i < bodies.length; i++) {
    await page.setContent(`<style>${CSS}</style>${bodies[i]}`);
    const f = path.join(WORK, `${v.id}-scene${i}.png`);
    await page.screenshot({ path: f });
    files.push(f);
  }
  await page.close();
  return files;
}

// ---------- Encode ----------
function encode(v, files) {
  const D = [2.6, 2.3, 2.3, 2.5, 3.0], X = 0.35;
  const args = ["-v", "error", "-y"];
  files.forEach((f, i) => args.push("-loop", "1", "-t", String(D[i]), "-i", f));
  args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
  let fc = files.map((_, i) => `[${i}:v]scale=1080:1920,fps=30,format=yuv420p,setsar=1[v${i}];`).join("");
  let off = 0, prev = "v0";
  for (let i = 1; i < files.length; i++) {
    off += D[i - 1] - X;
    const out = i === files.length - 1 ? "vout" : `x${i}`;
    fc += `[${prev}][v${i}]xfade=transition=${i === files.length - 1 ? "fade" : "slideleft"}:duration=${X}:offset=${off.toFixed(2)}${out === "vout" ? ",format=yuv420p" : ""}[${out}];`;
    prev = out;
  }
  args.push("-filter_complex", fc.replace(/;$/, ""), "-map", "[vout]", "-map", `${files.length}:a`, "-shortest",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-crf", "20", "-preset", "medium", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
    path.join(OUT, `${v.id}.mp4`));
  execFileSync(ffmpeg, args, { stdio: "inherit" });
}

try {
  for (const v of videos.filter((v) => !only.length || only.includes(v.id))) {
    const shots = await shoot(v);
    encode(v, await scenes(v, shots));
    console.log(`made privatepdf/promo/${v.id}.mp4`);
  }
} finally {
  await browser.close();
  server.close();
}
