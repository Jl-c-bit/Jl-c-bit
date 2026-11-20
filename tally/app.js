import {
  FY, calculate, sellOrWait, importCSV, gainOf, isDiscountable, discountDate,
  inFY, money, summaryText, num,
} from "./core.js";

const $ = (id) => document.getElementById(id);
const KEY = "tally:v1";

const state = load() || { income: "", carried: "", trades: [], wait: {} };

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

const amount = (v) => { const n = num(v); return Number.isFinite(n) ? n : 0; };
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ---------- tabs ----------

for (const [tab, panel] of [["tab-trades", "panel-trades"], ["tab-wait", "panel-wait"]]) {
  $(tab).addEventListener("click", () => {
    document.querySelectorAll("[role=tab]").forEach((t) => t.setAttribute("aria-selected", String(t.id === tab)));
    document.querySelectorAll("[role=tabpanel]").forEach((p) => (p.hidden = p.id !== panel));
    if (panel === "panel-wait") renderWait();
  });
}

// ---------- shared inputs ----------

$("income").value = state.income;
$("carried").value = state.carried;
for (const id of ["income", "carried"]) {
  $(id).addEventListener("input", (e) => { state[id] = e.target.value; save(); renderTotals(); renderWait(); });
}

// ---------- trade table ----------

function blankTrade() {
  return { id: crypto.randomUUID?.() || String(Math.random()), coin: "", bought: "", sold: "", cost: "", proceeds: "" };
}

function renderRows() {
  const body = $("rows");
  body.textContent = "";
  for (const t of state.trades) body.appendChild(rowFor(t));
  $("empty").hidden = state.trades.length > 0;
  renderTotals();
}

function rowFor(t) {
  const tr = document.createElement("tr");
  tr.dataset.id = t.id;
  const cell = (cls, input) => { const td = document.createElement("td"); if (cls) td.className = cls; td.appendChild(input); tr.appendChild(td); return td; };
  const field = (key, attrs) => {
    const i = document.createElement("input");
    Object.assign(i, attrs);
    i.value = t[key] ?? "";
    i.setAttribute("aria-label", attrs["aria-label"]);
    i.addEventListener("input", () => { t[key] = key === "coin" ? i.value.toUpperCase() : i.value; save(); updateRow(tr, t); renderTotals(); });
    return i;
  };
  cell("coin", field("coin", { placeholder: "BTC", "aria-label": "Coin", autocomplete: "off" }));
  cell("", field("bought", { type: "date", "aria-label": "Bought" }));
  cell("", field("sold", { type: "date", "aria-label": "Sold or swapped" }));
  cell("money", field("cost", { inputmode: "decimal", placeholder: "0", "aria-label": "Cost in AUD" }));
  cell("money", field("proceeds", { inputmode: "decimal", placeholder: "0", "aria-label": "Proceeds in AUD" }));
  const gain = document.createElement("td"); gain.className = "gain"; tr.appendChild(gain);
  const type = document.createElement("td"); type.className = "type"; tr.appendChild(type);
  const del = document.createElement("button");
  del.className = "del"; del.type = "button"; del.textContent = "×"; del.title = "Remove";
  del.setAttribute("aria-label", "Remove trade");
  del.addEventListener("click", () => { state.trades = state.trades.filter((x) => x !== t); save(); renderRows(); });
  cell("", del);
  updateRow(tr, t);
  return tr;
}

function updateRow(tr, t) {
  const g = gainOf(asNumbers(t));
  const gain = tr.querySelector(".gain");
  gain.textContent = t.cost === "" && t.proceeds === "" ? "–" : (g > 0 ? "+" : "") + money(g);
  gain.className = "gain " + (g > 0 ? "pos" : g < 0 ? "neg" : "");
  const type = tr.querySelector(".type");
  let label = "–", cls = "tag", title = "";
  if (t.unmatched && !t.bought) { label = "Check cost"; cls += " flag"; title = "No matching buy was found in your file."; }
  else if (t.sold && !inFY(t.sold)) { label = "Not 2026–27"; cls += " flag"; title = `Only sales from 1 Jul 2026 to 30 Jun 2027 count this year.`; }
  else if (g < 0) { label = "Loss"; }
  else if (t.bought && t.sold) {
    if (isDiscountable(t.bought, t.sold)) { label = "50% discount"; cls += " disc"; }
    else { label = "Under 12 mo"; title = `Eligible for the discount from ${fmtDate(discountDate(t.bought))}.`; }
  }
  type.innerHTML = "";
  const span = document.createElement("span");
  span.className = cls; span.textContent = label; if (title) span.title = title;
  type.appendChild(span);
}

function asNumbers(t) {
  return { bought: t.bought, sold: t.sold, cost: amount(t.cost), proceeds: amount(t.proceeds) };
}

function countedTrades() {
  return state.trades.filter((t) => !t.sold || inFY(t.sold)).map(asNumbers);
}

function results() {
  return calculate({ trades: countedTrades(), otherIncome: amount(state.income), carriedLosses: amount(state.carried) });
}

function renderTotals() {
  const r = results();
  $("s-gains").textContent = money(r.totalGains);
  $("s-losses").textContent = money(r.lossesUsed);
  $("s-saved").textContent = money(r.discountSaved);
  $("s-net").textContent = money(r.netCapitalGain);
  $("s-tax").textContent = money(r.extraTax);
  const note = $("carry-note");
  note.hidden = !(r.lossesToCarry > 0);
  note.textContent = `${money(r.lossesToCarry)} of losses left over. Carry it forward to next year.`;
}

$("add").addEventListener("click", () => {
  const t = blankTrade();
  state.trades.push(t);
  save();
  renderRows();
  $("rows").lastElementChild?.querySelector("input")?.focus();
});

$("clear").addEventListener("click", () => {
  if (!state.trades.length) return;
  if (!confirm(`Remove all ${state.trades.length} trades?`)) return;
  state.trades = [];
  save();
  renderRows();
});

$("copy").addEventListener("click", async () => {
  const text = summaryText(countedTrades(), results(), { otherIncome: amount(state.income), carriedLosses: amount(state.carried) });
  try { await navigator.clipboard.writeText(text); toast("Summary copied"); }
  catch { prompt("Copy this summary:", text); }
});

// ---------- import ----------

function runImport(text, name = "pasted text") {
  const msg = $("import-msg");
  let res;
  try { res = importCSV(text); } catch (e) { res = { disposals: [], warnings: [`Couldn't read that file: ${e.message}`], events: 0 }; }
  const added = res.disposals.map((d) => ({ ...blankTrade(), ...d, cost: String(d.cost), proceeds: String(d.proceeds) }));
  state.trades.push(...added);
  save();
  renderRows();
  msg.hidden = false;
  msg.className = "msg" + (res.warnings.length ? " warn" : "");
  msg.textContent = added.length
    ? `Added ${added.length} disposal${added.length === 1 ? "" : "s"} in ${FY.label} from ${res.events} trades in ${name}.`
    : `No ${FY.label} disposals found in ${name}.`;
  if (res.warnings.length) {
    const ul = document.createElement("ul");
    for (const w of res.warnings) { const li = document.createElement("li"); li.textContent = w; ul.appendChild(li); }
    msg.appendChild(ul);
  }
}

async function readFile(file) {
  if (!file) return;
  runImport(await file.text(), file.name);
}

$("choose").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", (e) => { readFile(e.target.files[0]); e.target.value = ""; });
$("paste-go").addEventListener("click", () => {
  const text = $("paste").value.trim();
  if (text) { runImport(text); $("paste").value = ""; }
});
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); readFile(e.dataTransfer.files[0]); });

// ---------- sell now or wait ----------

const W = { coin: "w-coin", bought: "w-bought", cost: "w-cost", value: "w-value" };
state.wait ||= {};
for (const [k, id] of Object.entries(W)) {
  $(id).value = state.wait[k] ?? "";
  $(id).addEventListener("input", (e) => { state.wait[k] = e.target.value; save(); renderWait(); });
}
$("w-stack").checked = state.wait.stack !== false;
$("w-stack").addEventListener("change", (e) => { state.wait.stack = e.target.checked; save(); renderWait(); });

function fmtDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function renderWait() {
  const out = $("w-out");
  const w = state.wait;
  const cost = amount(w.cost), value = amount(w.value);
  if (!w.bought || !(cost > 0) || !(value > 0)) { out.hidden = true; return; }
  const now = today();
  if (w.bought > now) { out.hidden = false; out.innerHTML = "<p>That purchase date is in the future.</p>"; return; }
  const coin = (w.coin || "this coin").toUpperCase();
  const r = sellOrWait({
    bought: w.bought, cost, value, today: now,
    otherIncome: amount(state.income),
    baseGain: $("w-stack").checked ? results().netCapitalGain : 0,
  });
  out.hidden = false;
  out.textContent = "";
  const h = (tag, text, cls) => { const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; out.appendChild(el); return el; };

  if (r.gain <= 0) {
    h("h3", "No gain to protect");
    h("p", `${coin} is ${r.gain < 0 ? "down " + money(-r.gain) : "flat"}. Selling now ${r.gain < 0 ? "gives you a capital loss you can use against other gains" : "triggers no tax"}, so the 12-month rule doesn't matter here.`);
    return;
  }
  if (r.alreadyEligible) {
    h("h3", "Already discounted");
    h("p", `You've held ${coin} long enough. Selling now is taxed on half the gain: about ${money(r.taxNow)} extra tax, leaving you ${money(r.keepNow)}.`);
    return;
  }
  h("h3", `Waiting ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"} saves about ${money(r.saving)}`);
  h("p", `${coin} qualifies for the 50% discount on ${fmtDate(r.eligible)}.`, "muted");
  const grid = document.createElement("div"); grid.className = "compare"; out.appendChild(grid);
  const opt = (title, tax, keep, best, note) => {
    const d = document.createElement("div"); d.className = "opt" + (best ? " best" : "");
    const s = document.createElement("span"); s.textContent = title;
    const b = document.createElement("b"); b.textContent = `${money(keep)} kept`;
    const sm = document.createElement("small"); sm.textContent = `${money(tax)} tax · ${note}`;
    d.append(s, b, sm); grid.appendChild(d);
  };
  opt("Sell today", r.taxNow, r.keepNow, false, "full gain taxed");
  opt(`Sell on ${fmtDate(r.eligible)}`, r.taxLater, r.keepLater, true, "if the price holds");
  const drop = (r.breakEvenDrop * 100).toFixed(1);
  h("p", `Waiting still wins unless ${coin} falls below ${money(r.breakEven)} by then, a drop of ${drop}%. Think of the discount as a cushion: the price can slide ${drop}% and you'd still end up even.`);
  if (r.eligible > FY.end) h("p", "Heads up: that date is in the next financial year, so the gain lands on next year's return and uses next year's rates.", "muted small");
}

// ---------- misc ----------

let toastTimer;
function toast(text) {
  const t = $("toast");
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 1800);
}

renderRows();
renderWait();
