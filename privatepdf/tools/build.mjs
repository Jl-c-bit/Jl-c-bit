// Generates the static pages: the home page and one page per tool, plus
// sitemap.xml and robots.txt. Run with `npm run build` after editing.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// The site is served from the Streakly Netlify site under /pdf/. For a
// standalone site at the root, build with BASE_PATH="" and change SITE_URL.
const SITE_URL = "https://chimerical-crostata-fb89ec.netlify.app";
const BASE = process.env.BASE_PATH ?? "/pdf";
const BRAND = "PrivatePDF";

const TOOLS = [
  {
    slug: "merge-pdf", name: "Merge PDF", icon: "merge",
    title: "Merge PDF Files Free, Without Uploading",
    h1: "Merge PDF files",
    lede: "Combine PDFs into one file, in the order you choose.",
    pick: "Choose PDF files", accept: ".pdf,application/pdf", multiple: true,
    steps: ["Choose two or more PDFs.", "Drag them into order with the arrows.", "Tap Merge and download your new PDF."],
    faq: [["Is there a limit on how many PDFs I can merge?", "No limit on the number of files. On the free plan, all files together can be up to 25 MB."]],
  },
  {
    slug: "split-pdf", name: "Split PDF", icon: "split",
    title: "Split PDF: Extract Pages Free, Without Uploading",
    h1: "Split a PDF",
    lede: "Pull out the pages you need, or save every page as its own PDF.",
    pick: "Choose a PDF", accept: ".pdf,application/pdf", multiple: false,
    steps: ["Choose a PDF.", "Type the pages you want, like 1-3, 5, or pick every page.", "Tap Split and download."],
    options: `
      <fieldset class="opt">
        <legend>What do you want?</legend>
        <label class="choice"><input type="radio" name="split-mode" value="range" checked> <span>Pick pages <small>Makes one PDF with just those pages</small></span></label>
        <div class="range-row"><label for="pages" class="sr">Pages</label><input id="pages" type="text" inputmode="numeric" autocomplete="off" placeholder="e.g. 1-3, 5"><span id="page-info" class="hint"></span></div>
        <label class="choice"><input type="radio" name="split-mode" value="each"> <span>Every page separately <small>One PDF per page</small></span></label>
      </fieldset>`,
    faq: [["How do I type page ranges?", "Use commas and dashes: 1-3, 5 gives pages 1, 2, 3 and 5. 8- means page 8 to the end."]],
  },
  {
    slug: "compress-pdf", name: "Compress PDF", icon: "compress",
    title: "Compress PDF Free: Make PDFs Smaller Without Uploading",
    h1: "Compress a PDF",
    lede: "Shrink a PDF so it's easier to email and upload.",
    pick: "Choose a PDF", accept: ".pdf,application/pdf", multiple: false,
    steps: ["Choose a PDF.", "Pick how small you want it.", "Tap Compress and download the smaller file."],
    options: `
      <fieldset class="opt">
        <legend>How small?</legend>
        <label class="choice"><input type="radio" name="level" value="strong"> <span>Smallest file <small>Lower image quality</small></span></label>
        <label class="choice"><input type="radio" name="level" value="balanced" checked> <span>Balanced <small>Good for email</small></span></label>
        <label class="choice"><input type="radio" name="level" value="light"> <span>Best quality <small>Smaller savings</small></span></label>
      </fieldset>
      <p class="hint">Compressing turns each page into an image, so text in the new file can't be selected or searched. Best for scans and photo-heavy PDFs.</p>`,
    faq: [["Why is my compressed file not smaller?", "PDFs that are mostly plain text are already small. Compression helps most with scans and PDFs full of photos. If the result is bigger, keep your original."]],
  },
  {
    slug: "rotate-pdf", name: "Rotate PDF", icon: "rotate",
    title: "Rotate PDF Pages Free, Without Uploading",
    h1: "Rotate a PDF",
    lede: "Turn every page the right way up and save it.",
    pick: "Choose a PDF", accept: ".pdf,application/pdf", multiple: false,
    steps: ["Choose a PDF.", "Pick which way to turn it.", "Tap Rotate and download."],
    options: `
      <fieldset class="opt">
        <legend>Turn pages</legend>
        <label class="choice"><input type="radio" name="angle" value="90" checked> <span>Right 90°</span></label>
        <label class="choice"><input type="radio" name="angle" value="180"> <span>Upside down 180°</span></label>
        <label class="choice"><input type="radio" name="angle" value="270"> <span>Left 90°</span></label>
      </fieldset>`,
    faq: [["Does rotating lower the quality?", "No. Rotating only changes which way the pages face. Nothing is re-compressed."]],
  },
  {
    slug: "jpg-to-pdf", name: "JPG to PDF", icon: "image",
    title: "JPG to PDF: Convert Photos to PDF Free, Without Uploading",
    h1: "Turn photos into a PDF",
    lede: "Combine JPG and PNG images into one PDF, in any order.",
    pick: "Choose images", accept: "image/*", multiple: true,
    steps: ["Choose your photos or scans.", "Put them in order and pick a page size.", "Tap Create PDF and download."],
    options: `
      <fieldset class="opt">
        <legend>Page size</legend>
        <label class="choice"><input type="radio" name="size" value="fit" checked> <span>Same as the image</span></label>
        <label class="choice"><input type="radio" name="size" value="a4"> <span>A4 <small>Most countries</small></span></label>
        <label class="choice"><input type="radio" name="size" value="letter"> <span>US Letter</span></label>
      </fieldset>`,
    faq: [["Which image types work?", "JPG and PNG work best. WebP and GIF are converted automatically. For iPhone HEIC photos, pick them from your Photos app, which usually hands over a JPG."]],
  },
  {
    slug: "pdf-to-jpg", name: "PDF to JPG", icon: "photo",
    title: "PDF to JPG: Save PDF Pages as Images Free, Without Uploading",
    h1: "Turn a PDF into JPG images",
    lede: "Save every page of a PDF as a sharp JPG image.",
    pick: "Choose a PDF", accept: ".pdf,application/pdf", multiple: false,
    steps: ["Choose a PDF.", "Tap Convert.", "Download each page as a JPG."],
    faq: [["How sharp are the images?", "Pages are saved at twice normal screen size, sharp enough to read on any phone or post online."]],
  },
];

const SHARED_FAQ = [
  ["Are my files uploaded anywhere?", `No. ${BRAND} works entirely inside your browser. Your files never leave your device, and it keeps working even if you go offline after the page loads.`],
  ["Is it free?", "Yes. You get 3 free tasks a day with files up to 25 MB. Pro removes the limits for a one-time $4.99, with no subscription."],
];

const ICONS = {
  merge: '<path d="M7 4v6a5 5 0 0 0 5 5h0a5 5 0 0 1 5 5v0M17 4v6a5 5 0 0 1-5 5"/><path d="M12 15v5"/>',
  split: '<path d="M12 4v5M12 9 6 15v5M12 9l6 6v5"/>',
  compress: '<path d="M4 9h16M4 15h16M12 3v4l-2-2m2 2 2-2M12 21v-4l-2 2m2-2 2 2"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
  image: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="m20 15-4.5-4.5L6 20"/>',
  photo: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8 17l3-3 2 2 3-3"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
const icon = (name, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function head({ title, description, path }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)} | ${BRAND}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${SITE_URL}${BASE}${path}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta name="theme-color" content="#2f45c8">
  <link rel="icon" href="${BASE}/assets/icon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@600;800&family=Public+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap">
  <link rel="stylesheet" href="${BASE}/assets/styles.css">
</head>`;
}

function header(active) {
  const links = TOOLS.map((t) => `<a href="${BASE}/${t.slug}/"${t.slug === active ? ' aria-current="page"' : ""}>${t.name}</a>`).join("");
  return `<header class="top">
  <div class="top-row">
    <a class="brand" href="${BASE}/">${icon("lock", "brand-ico")}${BRAND}</a>
    <span class="plan" id="plan-chip" hidden>PRO</span>
    <button class="btn pro" id="upgrade-btn" type="button">Go Pro</button>
  </div>
  <nav class="tools-nav" aria-label="Tools">${links}</nav>
</header>`;
}

const footer = `<footer class="foot">
  <div class="foot-tools">${TOOLS.map((t) => `<a href="${BASE}/${t.slug}/">${t.name}</a>`).join("")}</div>
  <p>${BRAND} runs in your browser. Your files are never uploaded.</p>
  <p>Questions? <span class="email" id="support-email"></span></p>
</footer>`;

const proDialog = `<dialog id="pro-dialog" aria-labelledby="pro-title">
  <h2 id="pro-title">${BRAND} Pro</h2>
  <p class="muted">One payment. Yours forever. No subscription.</p>
  <ul class="perks">
    <li>Unlimited tasks every day <small>Free: 3 a day</small></li>
    <li>Files of any size <small>Free: up to 25 MB</small></li>
    <li>Every tool, on every device you use it on</li>
  </ul>
  <a id="buy-link" class="btn primary block" target="_blank" rel="noopener">Unlock Pro</a>
  <p class="hint" id="buy-note" hidden></p>
  <button type="button" class="link" id="close-pro">Not now</button>
</dialog>`;

const faqHtml = (items) => `<section class="faq"><h2>Questions</h2>${items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section>`;

function toolPage(t) {
  const path = `/${t.slug}/`;
  const description = `${t.lede} Free, and your files never leave your device.`;
  return `${head({ title: t.title, description, path })}
<body data-tool="${t.slug}">
${header(t.slug)}
<main class="page">
  <section class="intro">
    <h1>${t.h1}</h1>
    <p class="lede">${t.lede}</p>
    <p class="badge">${icon("lock", "badge-ico")} Files stay on your device</p>
  </section>

  <section class="tool" aria-label="${t.name}">
    <label class="drop" id="drop" for="file-input">
      <input id="file-input" type="file" accept="${t.accept}"${t.multiple ? " multiple" : ""}>
      ${icon(t.icon, "drop-ico")}
      <span class="btn primary">${t.pick}</span>
      <span class="hint">or drop ${t.multiple ? "them" : "it"} here</span>
    </label>
    <ul class="files" id="file-list" hidden></ul>
    <div class="options" id="options" hidden>${t.options || ""}</div>
    <div class="actions" id="actions" hidden>
      <button class="btn primary" id="run" type="button"></button>
      <button class="btn" id="clear" type="button">Start over</button>
    </div>
    <p class="limit" id="limit-note"></p>
    <div class="progress" id="progress" hidden><div class="bar"><span id="progress-fill"></span></div><p id="progress-text">Working…</p></div>
    <p class="error" id="error" role="alert" hidden></p>
    <div class="results" id="results" hidden></div>
  </section>

  <section class="how">
    <h2>How it works</h2>
    <ol>${t.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
  </section>
  ${faqHtml([...t.faq, ...SHARED_FAQ])}
</main>
${footer}
${proDialog}
<script type="module" src="${BASE}/assets/app.js"></script>
</body>
</html>
`;
}

function homePage() {
  return `${head({ title: "Free PDF Tools That Never Upload Your Files", description: "Merge, split, compress, rotate and convert PDFs right in your browser. Free, fast, and your files never leave your device.", path: "/" })}
<body data-tool="home">
${header("")}
<main class="page">
  <section class="intro home">
    <h1>PDF tools that keep your files on your device</h1>
    <p class="lede">Merge, split, compress and convert PDFs in your browser. Nothing is uploaded, so it's fast and private.</p>
  </section>
  <section class="grid" aria-label="Tools">
    ${TOOLS.map((t) => `<a class="card" href="${BASE}/${t.slug}/">${icon(t.icon, "card-ico")}<span class="card-name">${t.name}</span><span class="card-desc">${esc(t.lede)}</span></a>`).join("")}
  </section>
  <section class="why">
    <div><h2>Private by design</h2><p>Other PDF sites upload your documents to their servers. ${BRAND} does all the work on your phone or computer.</p></div>
    <div><h2>Free for everyday use</h2><p>3 free tasks a day. Need more? Pro is a one-time $4.99, with no subscription.</p></div>
    <div><h2>No sign-up</h2><p>No account and no email. Open a tool and go.</p></div>
  </section>
  ${faqHtml(SHARED_FAQ)}
</main>
${footer}
${proDialog}
<script type="module" src="${BASE}/assets/app.js"></script>
</body>
</html>
`;
}

function write(rel, content) {
  const file = join(ROOT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

write("index.html", homePage());
for (const t of TOOLS) write(`${t.slug}/index.html`, toolPage(t));
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["/", ...TOOLS.map((t) => `/${t.slug}/`)].map((p) => `  <url><loc>${SITE_URL}${BASE}${p}</loc></url>`).join("\n")}
</urlset>
`);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}${BASE}/sitemap.xml\n`);
console.log(`Built ${TOOLS.length + 1} pages`);
