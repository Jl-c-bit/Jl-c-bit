// Pure, DOM-free logic for Streakly. Everything here is unit-tested.

export const FREE_HABIT_LIMIT = 3;

// Dates are stored as local-time "YYYY-MM-DD" keys so a check-in belongs to
// the user's calendar day, not a UTC day.
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const date = parseKey(key);
  date.setDate(date.getDate() + n);
  return dateKey(date);
}

// Consecutive completed days ending today. If today isn't done yet the streak
// is still "alive" as long as yesterday was done.
export function currentStreak(log, today = dateKey()) {
  let day = log[today] ? today : addDays(today, -1);
  let streak = 0;
  while (log[day]) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export function longestStreak(log) {
  const days = Object.keys(log).filter((k) => log[k]).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const day of days) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

// Share of the last `days` days (including today) that were completed,
// never counting days before the habit existed.
export function completionRate(log, createdKey, today = dateKey(), days = 30) {
  let total = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(today, -i);
    if (day < createdKey) break;
    total++;
    if (log[day]) done++;
  }
  return total === 0 ? 0 : done / total;
}

export function lastNDays(n, today = dateKey()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(today, -i));
  return out;
}

export function canAddHabit(state) {
  return state.pro || state.habits.length < FREE_HABIT_LIMIT;
}

export function toggleDay(habit, key) {
  const log = { ...habit.log };
  if (log[key]) delete log[key];
  else log[key] = true;
  return { ...habit, log };
}

export function createHabit({ name, emoji = "✅", color = "#22c55e" }, now = new Date()) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) throw new Error("Habit name is required");
  return {
    id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed.slice(0, 60),
    emoji,
    color,
    createdAt: dateKey(now),
    log: {},
  };
}

// Milestones drive the celebratory moments (and share prompts) that make
// streak apps sticky.
export const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

export function milestoneReached(before, after) {
  return MILESTONES.find((m) => before < m && after >= m) ?? null;
}

export function emptyState() {
  return { version: 1, pro: false, proReceipt: null, theme: "system", habits: [] };
}

// Whop redirects back to the return URL with ?status=success|error when a
// payment method (e.g. PayPal, 3-D Secure) had to leave the page.
export function checkoutReturnStatus(search) {
  const status = new URLSearchParams(search).get("status");
  return status === "success" || status === "error" ? status : null;
}

// Whop receipt/payment IDs look like "pay_XXXX"; keep only safe characters.
export function cleanReceiptId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

// Accepts untrusted JSON (from storage or an import file) and returns a
// well-formed state, dropping anything malformed.
export function sanitizeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  const keyRe = /^\d{4}-\d{2}-\d{2}$/;
  const habits = Array.isArray(raw.habits) ? raw.habits : [];
  base.pro = raw.pro === true;
  base.proReceipt = cleanReceiptId(raw.proReceipt);
  base.theme = ["system", "light", "dark", "sunset", "ocean"].includes(raw.theme) ? raw.theme : "system";
  base.habits = habits
    .filter((h) => h && typeof h.name === "string" && h.name.trim())
    .map((h) => ({
      id: String(h.id ?? Math.random().toString(36).slice(2)),
      name: h.name.trim().slice(0, 60),
      emoji: typeof h.emoji === "string" ? h.emoji.slice(0, 8) : "✅",
      color: /^#[0-9a-f]{6}$/i.test(h.color) ? h.color : "#22c55e",
      createdAt: keyRe.test(h.createdAt) ? h.createdAt : dateKey(),
      log: Object.fromEntries(
        Object.entries(h.log && typeof h.log === "object" ? h.log : {})
          .filter(([k, v]) => keyRe.test(k) && v === true)
      ),
    }));
  return base;
}
