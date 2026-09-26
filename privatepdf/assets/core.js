// Pure, DOM-free logic for PrivatePDF. Everything here is unit-tested.

export const FREE_TASKS_PER_DAY = 3;
export const FREE_MAX_BYTES = 25 * 1024 * 1024; // per task, all files combined

export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// "1-3, 5, 8-" -> [0, 1, 2, 4, 7, 8, ...] (zero-based, in the order typed,
// duplicates removed). Throws a readable Error for anything invalid.
export function parsePageRanges(input, pageCount) {
  const text = String(input ?? "").trim();
  if (!text) throw new Error("Enter the pages you want, for example 1-3, 5.");
  const out = [];
  const seen = new Set();
  for (const raw of text.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d+)?\s*(-)?\s*(\d+)?$/);
    if (!m || (!m[1] && !m[3]) || (!m[2] && m[3] && !m[1])) {
      throw new Error(`"${part}" isn't a page or range. Use numbers like 2 or 4-7.`);
    }
    const start = m[1] ? Number(m[1]) : 1;
    const end = m[2] ? (m[3] ? Number(m[3]) : pageCount) : start;
    if (start < 1 || end < 1) throw new Error("Page numbers start at 1.");
    if (start > pageCount || end > pageCount) {
      throw new Error(`This PDF has ${pageCount} page${pageCount === 1 ? "" : "s"}. "${part}" goes past the end.`);
    }
    if (start > end) throw new Error(`"${part}" runs backwards. Write the smaller number first.`);
    for (let p = start; p <= end; p++) {
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p - 1);
      }
    }
  }
  if (!out.length) throw new Error("Enter the pages you want, for example 1-3, 5.");
  return out;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function emptyState() {
  return { version: 1, pro: false, day: null, used: 0 };
}

export function sanitizeState(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== "object") return s;
  s.pro = raw.pro === true;
  s.day = typeof raw.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.day) ? raw.day : null;
  s.used = Number.isInteger(raw.used) && raw.used >= 0 ? raw.used : 0;
  return s;
}

export function tasksUsedToday(state, today = dateKey()) {
  return state.day === today ? state.used : 0;
}

// Returns null when the task may run, or a reason object when the free plan blocks it.
export function checkLimit(state, totalBytes, today = dateKey()) {
  if (state.pro) return null;
  if (totalBytes > FREE_MAX_BYTES) {
    return { reason: "size", message: `Free files can be up to ${formatBytes(FREE_MAX_BYTES)} in total. These are ${formatBytes(totalBytes)}.` };
  }
  if (tasksUsedToday(state, today) >= FREE_TASKS_PER_DAY) {
    return { reason: "daily", message: `You've used your ${FREE_TASKS_PER_DAY} free tasks for today. They reset tomorrow.` };
  }
  return null;
}

export function recordTask(state, today = dateKey()) {
  return { ...state, day: today, used: tasksUsedToday(state, today) + 1 };
}

// "Report Final.pdf" + "compressed" -> "Report Final-compressed.pdf"
export function outputName(inputName, suffix, ext = "pdf") {
  const base = String(inputName || "document").replace(/\.[^./\\]+$/, "").replace(/[\\/:*?"<>|]+/g, "").trim() || "document";
  return `${base}-${suffix}.${ext}`;
}

export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list.slice();
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

// Compression presets: render scale and JPEG quality.
export const COMPRESSION = {
  strong: { scale: 1.0, quality: 0.5, label: "Smallest file" },
  balanced: { scale: 1.5, quality: 0.65, label: "Balanced" },
  light: { scale: 2.0, quality: 0.8, label: "Best quality" },
};

export function checkoutReturned(search) {
  return new URLSearchParams(search).get("upgraded") === "1";
}
