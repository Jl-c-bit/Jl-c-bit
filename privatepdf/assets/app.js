import {
  checkLimit, recordTask, sanitizeState, tasksUsedToday, formatBytes, outputName, moveItem,
  parsePageRanges, checkoutReturned, COMPRESSION, FREE_TASKS_PER_DAY,
} from "./core.js";
import { PAYMENT_LINK, PRO_PRICE_LABEL, SUPPORT_EMAIL } from "./config.js";

const STORAGE_KEY = "privatepdf:v1";
const $ = (sel) => document.querySelector(sel);
const tool = document.body.dataset.tool;

// What each tool accepts and how it runs.
const TOOLS = {
  "merge-pdf": { kind: "pdf", multiple: true, min: 2, run: "Merge PDFs", reorder: true },
  "split-pdf": { kind: "pdf", multiple: false, min: 1, run: "Split PDF" },
  "compress-pdf": { kind: "pdf", multiple: false, min: 1, run: "Compress PDF" },
  "rotate-pdf": { kind: "pdf", multiple: false, min: 1, run: "Rotate PDF" },
  "jpg-to-pdf": { kind: "image", multiple: true, min: 1, run: "Create PDF", reorder: true },
  "pdf-to-jpg": { kind: "pdf", multiple: false, min: 1, run: "Convert to JPG" },
};
const cfg = TOOLS[tool];

let state = loadState();
let files = []; // { id, name, size, bytes, type, pages? }
let busy = false;
let resultUrls = [];
let pickLabel = "";

function loadState() {
  try {
    return sanitizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return sanitizeState(null);
  }
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage blocked: limits just won't persist */ }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Plan / Pro ----------

function renderPlan() {
  $("#plan-chip").hidden = !state.pro;
  $("#upgrade-btn").hidden = state.pro;
  const note = $("#limit-note");
  if (!note) return;
  if (state.pro) note.textContent = "Pro: unlimited tasks, any file size.";
  else {
    const left = Math.max(0, FREE_TASKS_PER_DAY - tasksUsedToday(state));
    note.textContent = `Free: ${left} of ${FREE_TASKS_PER_DAY} tasks left today, files up to 25 MB.`;
  }
}

function openPro(reason) {
  const link = $("#buy-link");
  const note = $("#buy-note");
  link.textContent = `Unlock Pro · ${PRO_PRICE_LABEL}`;
  if (PAYMENT_LINK) {
    link.href = PAYMENT_LINK;
    link.hidden = false;
    note.hidden = !reason;
    note.textContent = reason || "";
  } else {
    link.hidden = true;
    note.hidden = false;
    note.textContent = (reason ? reason + " " : "") + "Pro checkout isn't set up yet.";
  }
  $("#pro-dialog").showModal();
}

$("#upgrade-btn").addEventListener("click", () => openPro());
$("#close-pro").addEventListener("click", () => $("#pro-dialog").close());
$("#support-email").textContent = SUPPORT_EMAIL;

if (checkoutReturned(location.search)) {
  history.replaceState(null, "", location.pathname);
  state = { ...state, pro: true };
  saveState();
}
renderPlan();

// Home page has no tool.
if (cfg) initTool();

// ---------- Tool ----------

function initTool() {
  $("#run").textContent = cfg.run;
  pickLabel = $(".drop .btn").textContent;
  const input = $("#file-input");
  const drop = $("#drop");

  input.addEventListener("change", () => {
    addFiles(input.files);
    input.value = "";
  });
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => addFiles(e.dataTransfer?.files));

  $("#file-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn || busy) return;
    const i = Number(btn.closest("li").dataset.index);
    if (btn.dataset.act === "up") files = moveItem(files, i, i - 1);
    if (btn.dataset.act === "down") files = moveItem(files, i, i + 1);
    if (btn.dataset.act === "remove") files.splice(i, 1);
    clearResults();
    render();
  });

  $("#run").addEventListener("click", run);
  $("#clear").addEventListener("click", () => {
    files = [];
    clearResults();
    hideError();
    render();
  });
  $("#pages")?.addEventListener("focus", () => {
    const r = document.querySelector('input[name="split-mode"][value="range"]');
    if (r) r.checked = true;
  });
  render();
}

const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const isImage = (f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name);

async function addFiles(list) {
  if (!list || !list.length || busy) return;
  hideError();
  clearResults();
  const picked = [...list];
  const ok = picked.filter(cfg.kind === "pdf" ? isPdf : isImage);
  const skipped = picked.length - ok.length;
  if (!ok.length) {
    showError(cfg.kind === "pdf" ? "That isn't a PDF. Choose a file that ends in .pdf." : "Those aren't images. Choose JPG or PNG files.");
    return;
  }
  const incoming = cfg.multiple ? ok : ok.slice(0, 1);
  for (const f of incoming) {
    if (/\.hei[cf]$/i.test(f.name) || /heic|heif/i.test(f.type)) {
      showError(`${f.name} is an iPhone HEIC photo. Pick it from your Photos app instead, which hands over a JPG.`);
      continue;
    }
    try {
      const entry = { id: Math.random().toString(36).slice(2), name: f.name, size: f.size, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) };
      if (cfg.kind === "image") Object.assign(entry, await normalizeImage(f, entry.bytes));
      files = cfg.multiple ? [...files, entry] : [entry];
    } catch {
      showError(`${f.name} couldn't be read. Try another file.`);
    }
  }
  if (skipped > 0) showError(`${skipped} file${skipped === 1 ? " was" : "s were"} skipped because ${skipped === 1 ? "it isn't" : "they aren't"} ${cfg.kind === "pdf" ? "a PDF" : "an image"}.`);
  render();
  if (cfg.kind === "pdf") countPages();
}

// JPG and PNG go in as they are; other image types are redrawn as PNG.
async function normalizeImage(file, bytes) {
  const type = (file.type || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/png") return { type };
  if (/\.jpe?g$/i.test(file.name)) return { type: "image/jpeg" };
  if (/\.png$/i.test(file.name)) return { type: "image/png" };
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  return { type: "image/png", bytes: new Uint8Array(await blob.arrayBuffer()) };
}

async function countPages() {
  const { pageCount } = await import("./pdfops.js");
  for (const f of files) {
    if (f.pages != null) continue;
    try {
      f.pages = await pageCount(f.bytes, f.name);
    } catch (err) {
      f.pages = null;
      f.problem = err.message;
    }
  }
  render();
}

function render() {
  const has = files.length > 0;
  $(".tool").classList.toggle("has-files", has);
  const list = $("#file-list");
  list.hidden = !has;
  list.innerHTML = files.map((f, i) => `
    <li class="file" data-index="${i}">
      <span class="file-no">${i + 1}</span>
      <span><span class="file-name">${esc(f.name)}</span>
        <span class="file-meta">${formatBytes(f.size)}${f.pages ? ` · ${f.pages} page${f.pages === 1 ? "" : "s"}` : ""}</span></span>
      <span class="file-btns">
        ${cfg.reorder ? `<button type="button" class="icon-btn" data-act="up" aria-label="Move ${esc(f.name)} up" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="icon-btn" data-act="down" aria-label="Move ${esc(f.name)} down" ${i === files.length - 1 ? "disabled" : ""}>↓</button>` : ""}
        <button type="button" class="icon-btn" data-act="remove" aria-label="Remove ${esc(f.name)}">✕</button>
      </span>
    </li>`).join("");
  $(".drop .btn").textContent = has ? (cfg.multiple ? "Add more" : "Choose a different file") : pickLabel;
  $("#options").hidden = !has || !$("#options").innerHTML.trim();
  $("#actions").hidden = !has;
  const needMore = files.length < cfg.min;
  $("#run").disabled = busy || needMore;
  $("#run").textContent = needMore ? `Add at least ${cfg.min} files` : cfg.run;
  const info = $("#page-info");
  if (info) info.textContent = files[0]?.pages ? `of ${files[0].pages} pages` : "";
  const problem = files.find((f) => f.problem);
  if (problem) showError(problem.problem);
}

function showError(msg) {
  const el = $("#error");
  el.textContent = msg;
  el.hidden = false;
}
function hideError() {
  $("#error").hidden = true;
}
function setProgress(fraction, text) {
  $("#progress").hidden = false;
  $("#progress-fill").style.width = `${Math.round(fraction * 100)}%`;
  if (text) $("#progress-text").textContent = text;
}
function clearResults() {
  resultUrls.forEach((u) => URL.revokeObjectURL(u));
  resultUrls = [];
  $("#results").hidden = true;
  $("#results").innerHTML = "";
}

const choice = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;

async function run() {
  if (busy || files.length < cfg.min) return;
  hideError();
  clearResults();
  const total = files.reduce((n, f) => n + f.size, 0);
  const block = checkLimit(state, total);
  if (block) {
    showError(block.message);
    openPro(block.message);
    return;
  }
  // Validate options before starting.
  let indices;
  if (tool === "split-pdf" && choice("split-mode") === "range") {
    try {
      indices = parsePageRanges($("#pages").value, files[0].pages ?? (await (await import("./pdfops.js")).pageCount(files[0].bytes, files[0].name)));
    } catch (err) {
      showError(err.message);
      $("#pages").focus();
      return;
    }
  }

  busy = true;
  render();
  setProgress(0.02, "Working… your files stay on this device.");
  let ops;
  try {
    ops = await import("./pdfops.js");
    const onProgress = (f) => setProgress(f, `Working… ${Math.round(f * 100)}%`);
    const f0 = files[0];
    let outputs = []; // { name, blob }
    let summary = "";
    const pdfBlob = (bytes) => new Blob([bytes], { type: "application/pdf" });

    if (tool === "merge-pdf") {
      outputs = [{ name: outputName(f0.name, "merged"), blob: pdfBlob(await ops.merge(files)) }];
      summary = `${files.length} PDFs combined into one.`;
    } else if (tool === "split-pdf") {
      if (indices) {
        outputs = [{ name: outputName(f0.name, "pages"), blob: pdfBlob(await ops.extract(f0, indices)) }];
        summary = `${indices.length} page${indices.length === 1 ? "" : "s"} saved as a new PDF.`;
      } else {
        const parts = await ops.splitAll(f0, onProgress);
        outputs = parts.map((b, i) => ({ name: outputName(f0.name, `page-${i + 1}`), blob: pdfBlob(b) }));
        summary = `Split into ${parts.length} PDFs, one per page.`;
      }
    } else if (tool === "compress-pdf") {
      const preset = COMPRESSION[choice("level")] || COMPRESSION.balanced;
      const blob = pdfBlob(await ops.compress(f0, preset, onProgress));
      const saved = 1 - blob.size / f0.size;
      if (saved <= 0.02) {
        summary = `This PDF is already small (${formatBytes(f0.size)}). Compressing made it ${formatBytes(blob.size)}, so keep your original.`;
      } else {
        summary = `${formatBytes(f0.size)} → ${formatBytes(blob.size)}. ${Math.round(saved * 100)}% smaller.`;
      }
      outputs = [{ name: outputName(f0.name, "compressed"), blob }];
    } else if (tool === "rotate-pdf") {
      const angle = Number(choice("angle") || 90);
      outputs = [{ name: outputName(f0.name, "rotated"), blob: pdfBlob(await ops.rotate(f0, angle)) }];
      summary = "Every page turned. Nothing was re-compressed.";
    } else if (tool === "jpg-to-pdf") {
      outputs = [{ name: outputName(files.length === 1 ? f0.name : "images", "pdf").replace(/-pdf\.pdf$/, ".pdf"), blob: pdfBlob(await ops.imagesToPdf(files, choice("size") || "fit")) }];
      summary = `${files.length} image${files.length === 1 ? "" : "s"} in one PDF.`;
    } else if (tool === "pdf-to-jpg") {
      const blobs = await ops.toImages(f0, onProgress);
      outputs = blobs.map((b, i) => ({ name: outputName(f0.name, `page-${i + 1}`, "jpg"), blob: b }));
      summary = `${blobs.length} page${blobs.length === 1 ? "" : "s"} saved as JPG.`;
    }

    state = recordTask(state);
    saveState();
    showResults(outputs, summary);
  } catch (err) {
    showError(ops && err instanceof ops.FriendlyError ? err.message : "Something went wrong while working on this file. Try again, or try a different file.");
    console.error(err);
  } finally {
    busy = false;
    $("#progress").hidden = true;
    render();
    renderPlan();
  }
}

function showResults(outputs, summary) {
  const box = $("#results");
  const items = outputs.map((o) => {
    const url = URL.createObjectURL(o.blob);
    resultUrls.push(url);
    return `<li class="result"><span>${esc(o.name)}<small>${formatBytes(o.blob.size)}</small></span>
      <a class="btn primary" href="${url}" download="${esc(o.name)}">Download</a></li>`;
  }).join("");
  box.innerHTML = `
    <h2>Done</h2>
    <p class="summary">${esc(summary)}</p>
    ${outputs.length > 1 ? `<button type="button" class="btn" id="download-all">Download all ${outputs.length}</button>` : ""}
    <ul class="result-list">${items}</ul>`;
  box.hidden = false;
  $("#download-all")?.addEventListener("click", async () => {
    for (const a of box.querySelectorAll(".result a")) {
      a.click();
      await new Promise((r) => setTimeout(r, 350));
    }
  });
  box.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
}
