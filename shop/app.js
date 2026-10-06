import { PRODUCTS, PROMO_CODES, SHIPPING, TAX_RATE, CURRENCY } from "./products.js";
import * as core from "./core.js";

const $ = (sel) => document.querySelector(sel);
const money = (c) => core.formatMoney(c, CURRENCY);
const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

// Per-viewer storage; the store still works if it is blocked.
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

const state = {
  cart: store.get("kg.cart", {}),
  promo: store.get("kg.promo", null),
  query: "",
  category: "All",
  sort: "featured",
};

// ---------- product art (inline SVG, no image files needed) ----------
const SHAPES = {
  mug: '<rect x="70" y="60" width="80" height="90" rx="10"/><path d="M150 80h14a18 18 0 0 1 0 36h-14" fill="none" stroke-width="10"/>',
  drop: '<path d="M120 40c30 40 45 65 45 85a45 45 0 0 1-90 0c0-20 15-45 45-85z"/>',
  square: '<path d="M80 50h80l10 110H70z"/><rect x="95" y="105" width="50" height="30" rx="4" opacity=".35"/>',
  flame: '<rect x="80" y="100" width="80" height="70" rx="8"/><path d="M120 50c14 18 18 30 10 42-4 6-16 6-20 0-8-12-4-24 10-42z"/>',
  waves: '<path d="M40 80q40-25 80 0t80 0v20q-40 25-80 0t-80 0zM40 120q40-25 80 0t80 0v20q-40 25-80 0t-80 0z"/>',
  pot: '<path d="M70 80h100l-14 85H84z"/><rect x="62" y="68" width="116" height="18" rx="4"/><path d="M120 68c-10-25 5-40 25-38-5 15-12 28-25 38z" opacity=".5"/>',
  grid: '<rect x="70" y="40" width="100" height="135" rx="8"/><g opacity=".35">' +
    Array.from({ length: 30 }, (_, i) => `<circle cx="${88 + (i % 5) * 16}" cy="${62 + Math.floor(i / 5) * 18}" r="2.5"/>`).join("") + "</g>",
  arc: '<rect x="70" y="160" width="70" height="12" rx="6"/><path d="M100 160V90q0-40 50-40" fill="none" stroke-width="8"/><path d="M135 50h40l-10 25h-20z"/>',
  line: '<rect x="55" y="105" width="140" height="16" rx="8" transform="rotate(-25 125 113)"/>',
  bag: '<rect x="65" y="80" width="110" height="95" rx="10"/><path d="M95 80v-12a25 25 0 0 1 50 0v12" fill="none" stroke-width="8"/>',
  bottle: '<rect x="95" y="65" width="50" height="115" rx="18"/><rect x="104" y="42" width="32" height="26" rx="6"/>',
  card: '<rect x="55" y="70" width="130" height="85" rx="12"/><rect x="55" y="92" width="130" height="14" opacity=".35"/>',
};
function art(p) {
  const [deep, light] = p.colors;
  return `<svg viewBox="0 0 240 210" role="img" aria-label="${p.name}" preserveAspectRatio="xMidYMid slice">
    <rect width="240" height="210" fill="${light}"/>
    <circle cx="200" cy="30" r="70" fill="${deep}" opacity=".12"/>
    <g fill="${deep}" stroke="${deep}">${SHAPES[p.shape] || ""}</g></svg>`;
}
const stars = (r) => "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r));

// ---------- catalog ----------
function renderCategories() {
  const cats = ["All", ...new Set(PRODUCTS.map((p) => p.category))];
  $("#categories").innerHTML = cats
    .map((c) => `<button class="chip" role="tab" aria-selected="${c === state.category}" data-cat="${c}">${c}</button>`)
    .join("");
}

function renderGrid() {
  const list = core.filterProducts(PRODUCTS, state);
  $("#result-count").textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;
  $("#grid").innerHTML = list.length
    ? list.map((p) => `
      <article class="card">
        <button class="art" data-view="${p.id}" aria-label="View ${p.name}">${art(p)}</button>
        <div class="info">
          <span class="tag">${p.category}</span>
          <h3>${p.name}</h3>
          <div class="row"><span class="price">${money(p.price)}</span><span class="stars" title="${p.rating} out of 5">${stars(p.rating)}</span></div>
          ${p.stock > 0
            ? `<button class="btn" data-add="${p.id}">Add to cart</button>`
            : `<span class="soldout">Sold out</span><button class="btn" disabled>Add to cart</button>`}
        </div>
      </article>`).join("")
    : `<p class="empty">No products match “${escapeHtml(state.query)}”.</p>`;
}

function openProduct(id) {
  const p = byId.get(id);
  $("#product-body").innerHTML = `
    <div class="drawer-head"><span class="tag">${p.category}</span><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="detail">
      <div class="art">${art(p)}</div>
      <div>
        <h2>${p.name}</h2>
        <p class="stars">${stars(p.rating)} <span class="muted small">${p.rating}</span></p>
        <p class="price" style="font-size:1.4rem">${money(p.price)}</p>
        <p>${p.description}</p>
        <p class="muted small">${p.stock > 0 ? (p.stock < 10 ? `Only ${p.stock} left` : "In stock") + " · ships in 1–2 days" : "Sold out"}</p>
        <button class="btn full" data-add="${p.id}" ${p.stock > 0 ? "" : "disabled"}>Add to cart</button>
      </div>
    </div>`;
  $("#product-dialog").showModal();
}

// ---------- cart ----------
function totals() {
  return core.computeTotals(core.cartLines(state.cart, PRODUCTS), {
    promo: state.promo, promos: PROMO_CODES, shipping: SHIPPING, taxRate: TAX_RATE,
  });
}

function totalsHtml(t) {
  return `<dt>Subtotal</dt><dd>${money(t.subtotal)}</dd>
    ${t.discount ? `<dt>Discount (${state.promo})</dt><dd>−${money(t.discount)}</dd>` : ""}
    <dt>Shipping</dt><dd>${t.subtotal === 0 ? "—" : t.shipping ? money(t.shipping) : "Free"}</dd>
    <dt>Tax</dt><dd>${money(t.tax)}</dd>
    <dt class="grand">Total</dt><dd class="grand">${money(t.total)}</dd>`;
}

function renderCart() {
  const lines = core.cartLines(state.cart, PRODUCTS);
  const count = core.cartCount(state.cart);
  const badge = $("#cart-count");
  if (badge.textContent !== String(count)) {
    badge.textContent = count;
    badge.classList.remove("bump"); void badge.offsetWidth; badge.classList.add("bump");
  }
  $("#cart-lines").innerHTML = lines.length
    ? lines.map(({ product: p, qty, lineTotal }) => `
      <div class="line">
        <div class="art">${art(p)}</div>
        <div>
          <strong>${p.name}</strong><div class="muted small">${money(p.price)}</div>
          <div class="qty">
            <button data-dec="${p.id}" aria-label="Decrease ${p.name}">−</button>
            <span>${qty}</span>
            <button data-inc="${p.id}" aria-label="Increase ${p.name}" ${qty >= p.stock ? "disabled" : ""}>+</button>
          </div>
        </div>
        <div style="text-align:right"><div>${money(lineTotal)}</div><button class="link" data-remove="${p.id}">Remove</button></div>
      </div>`).join("")
    : `<p class="empty">Your cart is empty.</p>`;
  const t = totals();
  const left = SHIPPING.freeOver - (t.subtotal - t.discount);
  $("#totals").innerHTML = totalsHtml(t) +
    (t.subtotal && left > 0 && t.shipping ? `<dt class="small" style="grid-column:span 2">Add ${money(left)} more for free shipping</dt>` : "");
  $("#checkout-btn").disabled = lines.length === 0;
  $("#promo-msg").textContent = state.promo ? `✓ ${PROMO_CODES[state.promo].label}` : "";
}

function save() {
  store.set("kg.cart", state.cart);
  store.set("kg.promo", state.promo);
  renderCart();
}

function add(id) {
  const p = byId.get(id);
  const before = state.cart[id] || 0;
  state.cart = core.addToCart(state.cart, p, 1);
  save();
  toast(state.cart[id] > before ? `Added ${p.name}` : `Only ${p.stock} in stock`);
}

// ---------- checkout ----------
function openCheckout() {
  $("#cart").close();
  $("#checkout-totals").innerHTML = totalsHtml(totals());
  $("#pay-note").textContent = "Demo checkout: no card is charged. See README to connect Stripe.";
  $("#checkout").showModal();
}

function placeOrder(e) {
  e.preventDefault();
  const form = Object.fromEntries(new FormData(e.target));
  const errors = core.validateCheckout(form);
  for (const input of e.target.querySelectorAll("input")) {
    const msg = errors[input.name] || "";
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    input.nextElementSibling.textContent = msg;
  }
  const first = e.target.querySelector('[aria-invalid="true"]');
  if (first) return first.focus();

  const t = totals();
  const order = {
    number: core.makeOrderNumber(), placedAt: new Date().toISOString(),
    customer: { name: form.name, email: form.email }, items: { ...state.cart }, totals: t,
  };
  store.set("kg.orders", [...store.get("kg.orders", []), order]);
  state.cart = {}; state.promo = null; save();
  e.target.reset();
  $("#checkout").close();
  $("#confirm-body").innerHTML = `
    <div class="success">
      <div class="check">✓</div>
      <h2 id="confirm-title">Thank you, ${escapeHtml(form.name.split(" ")[0])}!</h2>
      <p>Order <strong>${order.number}</strong> is confirmed. A receipt for <strong>${money(t.total)}</strong> would be sent to ${escapeHtml(form.email)}.</p>
      <button class="btn" data-close>Keep shopping</button>
    </div>`;
  $("#confirm").showModal();
}

// ---------- utilities ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

// ---------- events ----------
document.addEventListener("click", (e) => {
  const t = e.target.closest("button, [data-close]");
  if (!t) {
    if (e.target instanceof HTMLDialogElement) e.target.close(); // click on backdrop
    return;
  }
  const d = t.dataset;
  if (d.add) add(d.add);
  else if (d.view) openProduct(d.view);
  else if (d.cat) { state.category = d.cat; renderCategories(); renderGrid(); }
  else if (d.inc) { state.cart = core.setQuantity(state.cart, byId.get(d.inc), state.cart[d.inc] + 1); save(); }
  else if (d.dec) { state.cart = core.setQuantity(state.cart, byId.get(d.dec), state.cart[d.dec] - 1); save(); }
  else if (d.remove) { state.cart = core.setQuantity(state.cart, byId.get(d.remove), 0); save(); }
  else if ("close" in d) t.closest("dialog").close();
});
$("#cart-btn").addEventListener("click", () => { renderCart(); $("#cart").showModal(); });
$("#checkout-btn").addEventListener("click", openCheckout);
$("#checkout-form").addEventListener("submit", placeOrder);
$("#search").addEventListener("input", (e) => { state.query = e.target.value; renderGrid(); });
$("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderGrid(); });
$("#promo-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = core.normalizePromo($("#promo").value, PROMO_CODES);
  if (code) { state.promo = code; $("#promo").value = ""; save(); }
  else $("#promo-msg").textContent = "That code isn't valid.";
});

$("#free-over").textContent = money(SHIPPING.freeOver);
$("#year").textContent = new Date().getFullYear();
renderCategories();
renderGrid();
renderCart();
