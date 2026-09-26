// PDF operations. Everything runs in the visitor's browser; no file is uploaded.
// pdf-lib edits PDFs, pdf.js renders pages to images. Both load on first use.

let pdfLibPromise;
let pdfJsPromise;

function pdfLib() {
  pdfLibPromise ??= import("./vendor/pdf-lib.esm.min.js");
  return pdfLibPromise;
}

function pdfJs() {
  pdfJsPromise ??= import("./vendor/pdf.min.mjs").then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;
    return lib;
  });
  return pdfJsPromise;
}

export class FriendlyError extends Error {}

async function openPdf(bytes, name = "This file") {
  const { PDFDocument } = await pdfLib();
  try {
    return await PDFDocument.load(bytes);
  } catch (err) {
    if (/encrypt/i.test(err?.message || "")) {
      throw new FriendlyError(`${name} is password-protected. Remove the password first, then try again.`);
    }
    throw new FriendlyError(`${name} couldn't be opened. It may be damaged or not a real PDF.`);
  }
}

export async function pageCount(bytes, name) {
  return (await openPdf(bytes, name)).getPageCount();
}

export async function merge(files) {
  const { PDFDocument } = await pdfLib();
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await openPdf(f.bytes, f.name);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}

export async function extract(file, indices) {
  const { PDFDocument } = await pdfLib();
  const src = await openPdf(file.bytes, file.name);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

export async function splitAll(file, onProgress) {
  const { PDFDocument } = await pdfLib();
  const src = await openPdf(file.bytes, file.name);
  const total = src.getPageCount();
  const results = [];
  for (let i = 0; i < total; i++) {
    const out = await PDFDocument.create();
    const [page] = await out.copyPages(src, [i]);
    out.addPage(page);
    results.push(await out.save());
    onProgress?.((i + 1) / total);
  }
  return results;
}

export async function rotate(file, deg) {
  const { degrees } = await pdfLib();
  const doc = await openPdf(file.bytes, file.name);
  for (const page of doc.getPages()) {
    const current = page.getRotation().angle || 0;
    page.setRotation(degrees((((current + deg) % 360) + 360) % 360));
  }
  return doc.save();
}

// images: [{ bytes, type, width, height }] where type is image/jpeg or image/png.
// size: "fit" | "a4" | "letter"
export async function imagesToPdf(images, size = "fit") {
  const { PDFDocument } = await pdfLib();
  const doc = await PDFDocument.create();
  const PAGE = { a4: [595.28, 841.89], letter: [612, 792] };
  const MARGIN = 36;
  for (const img of images) {
    const embedded = img.type === "image/png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
    if (size === "fit") {
      const page = doc.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
      continue;
    }
    let [w, h] = PAGE[size];
    if (embedded.width > embedded.height) [w, h] = [h, w]; // landscape photo -> landscape page
    const scale = Math.min((w - MARGIN * 2) / embedded.width, (h - MARGIN * 2) / embedded.height, 1);
    const dw = embedded.width * scale;
    const dh = embedded.height * scale;
    const page = doc.addPage([w, h]);
    page.drawImage(embedded, { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh });
  }
  return doc.save();
}

async function renderPages(file, scale, onPage) {
  const lib = await pdfJs();
  const task = lib.getDocument({ data: file.bytes.slice(0), isEvalSupported: false });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (err) {
    if (err?.name === "PasswordException") {
      throw new FriendlyError(`${file.name} is password-protected. Remove the password first, then try again.`);
    }
    throw new FriendlyError(`${file.name} couldn't be opened. It may be damaged or not a real PDF.`);
  }
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
      await onPage({ canvas, index: i - 1, total: pdf.numPages, width: base.width, height: base.height });
      canvas.width = canvas.height = 0; // free memory on phones
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
}

const toBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new FriendlyError("Your browser ran out of memory. Try a smaller file."))), type, quality));

export async function compress(file, preset, onProgress) {
  const { PDFDocument } = await pdfLib();
  const out = await PDFDocument.create();
  await renderPages(file, preset.scale, async ({ canvas, index, total, width, height }) => {
    const jpg = await toBlob(canvas, "image/jpeg", preset.quality);
    const img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    const page = out.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
    onProgress?.((index + 1) / total);
  });
  return out.save();
}

export async function toImages(file, onProgress, scale = 2) {
  const results = [];
  await renderPages(file, scale, async ({ canvas, index, total }) => {
    results.push(await toBlob(canvas, "image/jpeg", 0.9));
    onProgress?.((index + 1) / total);
  });
  return results;
}
