import {
  dateKey, currentStreak, longestStreak, completionRate, lastNDays, canAddHabit,
  toggleDay, createHabit, milestoneReached, sanitizeState, emptyState, parseKey, FREE_HABIT_LIMIT,
  checkoutReturnStatus, cleanReceiptId,
} from "./core.js";
import { WHOP_PLAN_ID, WHOP_ENVIRONMENT, PRO_PRICE_LABEL, SUPPORT_EMAIL } from "./config.js";

const STORAGE_KEY = "streakly:v1";
const EMOJIS = ["✅", "📚", "🏃", "💧", "🧘", "🥗", "💤", "✍️", "🎸", "💪", "🧹", "🚭", "🌞", "💊", "🙏", "💰"];
const COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#eab308", "#14b8a6", "#ef4444"];
const SUGGESTIONS = [
  ["💧", "Drink 8 glasses of water"], ["📚", "Read 10 pages"],
  ["🏃", "Move for 20 minutes"], ["🧘", "Meditate 5 minutes"],
];
const PRO_THEMES = new Set(["sunset", "ocean"]);
const WHOP_LOADER = "https://js.whop.com/static/checkout/loader.js";
const WHOP_CONFIGURED = /^plan_[A-Za-z0-9]+$/.test(WHOP_PLAN_ID) && WHOP_PLAN_ID !== "plan_REPLACE_ME";

const $ = (sel) => document.querySelector(sel);
let state = load();
let openHabitId = null;
let picked = { emoji: EMOJIS[0], color: COLORS[0] };

function load() {
  try {
    return sanitizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return emptyState();
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast("Couldn't save. Storage may be full or disabled.");
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Rendering ----------

function render() {
  const today = dateKey();
  applyTheme();
  $("#pro-badge").hidden = !state.pro;
  $("#upgrade-btn").hidden = state.pro;
  $("#receipt-line").hidden = !state.proReceipt;
  $("#receipt-line").textContent = state.proReceipt ? `Pro receipt: ${state.proReceipt}` : "";
  $("#today-label").textContent = parseKey(today).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const done = state.habits.filter((h) => h.log[today]).length;
  const total = state.habits.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  $("#ring-fg").setAttribute("stroke-dasharray", `${pct} 100`);
  $("#ring-fg").style.opacity = pct ? 1 : 0;
  $("#ring-text").textContent = `${pct}%`;
  $("#summary-title").textContent = !total
    ? "Let's build some habits"
    : done === total ? "Perfect day! 🎉" : `${done} of ${total} done today`;

  const list = $("#habit-list");
  list.innerHTML = state.habits.map((h) => habitRow(h, today)).join("");
  $("#empty").hidden = total > 0;

  const limited = !canAddHabit(state);
  const note = $("#limit-note");
  note.hidden = state.pro;
  note.textContent = limited
    ? `Free plan: ${FREE_HABIT_LIMIT} habits. Go Pro for unlimited.`
    : `${total}/${FREE_HABIT_LIMIT} free habits used`;
  $("#add-btn").textContent = limited ? "🔒 Add more habits with Pro" : "+ Add habit";
}

function habitRow(h, today) {
  const streak = currentStreak(h.log, today);
  const isDone = !!h.log[today];
  const dots = lastNDays(7, today)
    .map((d) => `<span class="dot${h.log[d] ? " on" : ""}" title="${d}"></span>`)
    .join("");
  return `
    <li class="habit" style="--c:${h.color}" data-id="${h.id}">
      <button class="habit-main" data-action="detail">
        <span class="habit-emoji">${escapeHtml(h.emoji)}</span>
        <span class="habit-text">
          <span class="habit-name">${escapeHtml(h.name)}</span>
          <span class="habit-meta">${streak ? `🔥 ${streak} day${streak === 1 ? "" : "s"}` : "Start your streak"} · <span class="dots">${dots}</span></span>
        </span>
      </button>
      <button class="check${isDone ? " done" : ""}" data-action="toggle" aria-pressed="${isDone}" aria-label="Mark ${escapeHtml(h.name)} done today">✓</button>
    </li>`;
}

function renderDetail(h) {
  const today = dateKey();
  const cur = currentStreak(h.log, today);
  const best = longestStreak(h.log);
  const rate = Math.round(completionRate(h.log, h.createdAt, today, 30) * 100);
  const total = Object.keys(h.log).length;
  const days = state.pro ? 364 : 28;
  const cells = lastNDays(days, today)
    .map((d) => `<span class="cell${h.log[d] ? " on" : ""}" title="${d}"></span>`)
    .join("");
  const stat = (n, l, locked) =>
    `<div class="stat${locked ? " locked" : ""}"><b>${locked ? "🔒" : n}</b><span>${l}</span></div>`;
  $("#detail-body").innerHTML = `
    <h2 style="--c:${h.color}"><span>${escapeHtml(h.emoji)}</span> ${escapeHtml(h.name)}</h2>
    <div class="stats">
      ${stat(cur, "Current streak")}
      ${stat(best, "Best streak", !state.pro)}
      ${stat(rate + "%", "30-day rate", !state.pro)}
      ${stat(total, "Total check-ins", !state.pro)}
    </div>
    <div class="heatmap${state.pro ? " year" : ""}" style="--c:${h.color}">${cells}</div>
    ${state.pro ? "" : `<button class="btn btn-pro btn-block" data-open-pro>🔓 Unlock full-year heatmap and stats</button>`}`;
}

function applyTheme() {
  const theme = PRO_THEMES.has(state.theme) && !state.pro ? "system" : state.theme;
  document.documentElement.dataset.theme = theme;
  $("#theme-select").value = theme;
}

// ---------- Actions ----------

function toggleHabit(id) {
  const today = dateKey();
  const i = state.habits.findIndex((h) => h.id === id);
  if (i < 0) return;
  const before = currentStreak(state.habits[i].log, today);
  state.habits[i] = toggleDay(state.habits[i], today);
  const after = currentStreak(state.habits[i].log, today);
  save();
  render();
  if (after > before) {
    navigator.vibrate?.(15);
    const m = milestoneReached(before, after);
    if (m) celebrate(`${m}-day streak on “${state.habits[i].name}”! 🔥`, true);
    else if (state.habits.every((h) => h.log[today])) celebrate("Perfect day! Every habit done. 🎉");
  }
}

function openAdd(prefill) {
  if (!canAddHabit(state)) return openPro();
  $("#habit-name").value = prefill?.name ?? "";
  picked = { emoji: prefill?.emoji ?? EMOJIS[0], color: COLORS[state.habits.length % COLORS.length] };
  renderPickers();
  $("#add-dialog").showModal();
  $("#habit-name").focus();
}

function renderPickers() {
  $("#emoji-picker").innerHTML = EMOJIS
    .map((e) => `<button type="button" class="pick${e === picked.emoji ? " sel" : ""}" data-emoji="${e}">${e}</button>`).join("");
  $("#color-picker").innerHTML = COLORS
    .map((c) => `<button type="button" class="pick swatch${c === picked.color ? " sel" : ""}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join("");
}

function openPro() {
  $("#buy-btn").textContent = `Unlock Pro · ${PRO_PRICE_LABEL}`;
  $("#buy-btn").hidden = false;
  $("#checkout-box").hidden = true;
  $("#pro-dialog").showModal();
}

// ---------- Whop checkout ----------
// The embed is a <div data-whop-checkout-plan-id> that Whop's loader script
// turns into an in-page checkout iframe. The loader is fetched only when a
// buyer asks to pay, so free users never load third-party code.

let whopLoading = null;
function loadWhop() {
  whopLoading ??= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement("script"), { src: WHOP_LOADER, async: true });
    s.onload = resolve;
    s.onerror = () => {
      whopLoading = null;
      s.remove();
      reject(new Error("Whop checkout failed to load"));
    };
    document.head.appendChild(s);
  });
  return whopLoading;
}

function whopTheme() {
  const t = document.documentElement.dataset.theme;
  if (t === "dark" || t === "ocean") return "dark";
  if (t === "light" || t === "sunset") return "light";
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

async function startCheckout() {
  const status = $("#checkout-status");
  $("#buy-btn").hidden = true;
  $("#checkout-box").hidden = false;
  if (!WHOP_CONFIGURED) {
    status.textContent = "Checkout isn't set up yet. Set WHOP_PLAN_ID in config.js.";
    return;
  }
  status.textContent = "Loading secure checkout…";
  const mount = $("#whop-checkout");
  // Recreate the element each time so Whop mounts a fresh checkout.
  const el = document.createElement("div");
  Object.assign(el.dataset, {
    whopCheckoutPlanId: WHOP_PLAN_ID,
    whopCheckoutTheme: whopTheme(),
    whopCheckoutReturnUrl: location.origin + location.pathname,
    whopCheckoutOnComplete: "streaklyWhopComplete",
  });
  if (WHOP_ENVIRONMENT === "sandbox") el.dataset.whopCheckoutEnvironment = "sandbox";
  mount.replaceChildren(el);
  try {
    await loadWhop();
    status.textContent = "";
  } catch {
    status.textContent = "Couldn't reach the payment provider. Check your connection and try again.";
    $("#buy-btn").hidden = false;
  }
}

// Whop calls this global by name (data-whop-checkout-on-complete) once the
// payment succeeds in-page, with (planId, receiptId).
window.streaklyWhopComplete = (planId, receiptId) => {
  if (planId && planId !== WHOP_PLAN_ID) return;
  $("#pro-dialog").close();
  $("#whop-checkout").replaceChildren();
  unlockPro(receiptId);
};

function unlockPro(receiptId) {
  state.pro = true;
  state.proReceipt = cleanReceiptId(receiptId) ?? state.proReceipt;
  save();
  render();
  celebrate("Welcome to Streakly Pro! Thank you for your support 💚", true);
}

function celebrate(msg, big = false) {
  toast(msg);
  if (!big || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = $("#confetti");
  const colors = COLORS;
  box.innerHTML = Array.from({ length: 60 }, (_, i) =>
    `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.4}s;transform:rotate(${Math.random() * 360}deg)"></i>`
  ).join("");
  setTimeout(() => (box.innerHTML = ""), 2500);
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}

async function share(text) {
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) await navigator.share({ title: "Streakly", text, url });
    else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast("Link copied to clipboard");
    }
  } catch { /* user cancelled */ }
}

// ---------- Events ----------

$("#habit-list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  const id = e.target.closest(".habit")?.dataset.id;
  if (!btn || !id) return;
  if (btn.dataset.action === "toggle") toggleHabit(id);
  else {
    openHabitId = id;
    renderDetail(state.habits.find((h) => h.id === id));
    $("#detail-dialog").showModal();
  }
});

$("#add-btn").addEventListener("click", () => openAdd());
$("#suggestions").innerHTML = SUGGESTIONS
  .map(([emoji, name]) => `<button class="chip" data-emoji="${emoji}" data-name="${name}">${emoji} ${name}</button>`).join("");
$("#suggestions").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (b) openAdd({ emoji: b.dataset.emoji, name: b.dataset.name });
});

$("#add-dialog").addEventListener("click", (e) => {
  const b = e.target.closest(".pick");
  if (!b) return;
  if (b.dataset.emoji) picked.emoji = b.dataset.emoji;
  if (b.dataset.color) picked.color = b.dataset.color;
  renderPickers();
});

$("#add-form").addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  try {
    state.habits.push(createHabit({ name: $("#habit-name").value, ...picked }));
    save();
    render();
  } catch (err) {
    e.preventDefault();
    toast(err.message);
  }
});

$("#detail-dialog").addEventListener("click", (e) => {
  if (e.target.closest("[data-open-pro]")) {
    $("#detail-dialog").close();
    openPro();
  }
});
$("#close-detail").addEventListener("click", () => $("#detail-dialog").close());
$("#delete-habit").addEventListener("click", () => {
  const h = state.habits.find((x) => x.id === openHabitId);
  if (!h || !confirm(`Delete “${h.name}” and its history?`)) return;
  state.habits = state.habits.filter((x) => x.id !== openHabitId);
  save();
  render();
  $("#detail-dialog").close();
});

$("#upgrade-btn").addEventListener("click", openPro);
$("#buy-btn").addEventListener("click", startCheckout);
$("#close-pro").addEventListener("click", () => $("#pro-dialog").close());
$("#restore-btn").addEventListener("click", () => {
  location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Restore Streakly Pro")}&body=${encodeURIComponent("Receipt email or order ID:")}`;
});

$("#menu-btn").addEventListener("click", () => $("#settings-dialog").showModal());
$("#close-settings").addEventListener("click", () => $("#settings-dialog").close());
$("#theme-select").addEventListener("change", (e) => {
  const theme = e.target.value;
  if (PRO_THEMES.has(theme) && !state.pro) {
    e.target.value = state.theme;
    $("#settings-dialog").close();
    return openPro();
  }
  state.theme = theme;
  save();
  applyTheme();
});

$("#export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `streakly-backup-${dateKey()}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#import-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const imported = sanitizeState(JSON.parse(await file.text()));
    // Pro status comes from purchase on this device, never from an import file.
    state = { ...imported, pro: state.pro, proReceipt: state.proReceipt };
    save();
    render();
    toast(`Imported ${state.habits.length} habit(s)`);
  } catch {
    toast("That file isn't a valid Streakly backup");
  }
  e.target.value = "";
});

$("#share-app").addEventListener("click", () => {
  const best = Math.max(0, ...state.habits.map((h) => currentStreak(h.log)));
  share(best >= 3 ? `I'm on a ${best}-day streak with Streakly 🔥` : "I'm building better habits with Streakly 🔥");
});

// Re-render when the day rolls over or the tab comes back.
document.addEventListener("visibilitychange", () => !document.hidden && render());
setInterval(render, 60_000);

// Returning from a Whop checkout whose payment method had to leave the page.
const checkoutStatus = checkoutReturnStatus(location.search);
if (checkoutStatus) {
  history.replaceState(null, "", location.pathname);
  if (checkoutStatus === "success") unlockPro();
  else toast("Payment didn't go through. Please try again.");
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

render();
