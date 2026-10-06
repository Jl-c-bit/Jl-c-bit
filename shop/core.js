// Pure store logic (no DOM), so it can be unit-tested with `node --test`.

export function formatMoney(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

// A cart is a plain object: { [productId]: quantity }.
export function addToCart(cart, product, qty = 1) {
  const current = cart[product.id] || 0;
  const next = Math.min(current + qty, product.stock);
  if (next <= 0) return { ...cart };
  return { ...cart, [product.id]: next };
}

export function setQuantity(cart, product, qty) {
  const copy = { ...cart };
  const clamped = Math.min(Math.max(0, Math.floor(qty) || 0), product.stock);
  if (clamped === 0) delete copy[product.id];
  else copy[product.id] = clamped;
  return copy;
}

export function cartLines(cart, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return Object.entries(cart)
    .filter(([id, qty]) => byId.has(id) && qty > 0)
    .map(([id, qty]) => {
      const product = byId.get(id);
      return { product, qty, lineTotal: product.price * qty };
    });
}

export function cartCount(cart) {
  return Object.values(cart).reduce((n, q) => n + q, 0);
}

export function normalizePromo(code, promos) {
  const key = String(code || "").trim().toUpperCase();
  return promos[key] ? key : null;
}

export function computeTotals(lines, { promo = null, promos = {}, shipping, taxRate }) {
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const rule = promo ? promos[promo] : null;
  const discount = rule && rule.type === "percent" ? Math.round((subtotal * rule.value) / 100) : 0;
  const afterDiscount = subtotal - discount;
  let ship = 0;
  if (subtotal > 0 && !(rule && rule.type === "shipping") && afterDiscount < shipping.freeOver) {
    ship = shipping.flat;
  }
  const tax = Math.round(afterDiscount * taxRate);
  return { subtotal, discount, shipping: ship, tax, total: afterDiscount + ship + tax };
}

export function filterProducts(products, { query = "", category = "All", sort = "featured" } = {}) {
  const q = query.trim().toLowerCase();
  let list = products.filter(
    (p) =>
      (category === "All" || p.category === category) &&
      (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
  );
  const sorters = {
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    rating: (a, b) => b.rating - a.rating,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  if (sorters[sort]) list = [...list].sort(sorters[sort]);
  return list;
}

export function validateCheckout(form) {
  const errors = {};
  if (!form.name || form.name.trim().length < 2) errors.name = "Enter your full name";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email || "")) errors.email = "Enter a valid email";
  if (!form.address || form.address.trim().length < 5) errors.address = "Enter a street address";
  if (!form.city || !form.city.trim()) errors.city = "Enter a city";
  if (!/^[A-Za-z0-9 -]{3,10}$/.test((form.zip || "").trim())) errors.zip = "Enter a valid postal code";
  return errors;
}

export function makeOrderNumber(now = Date.now(), rand = Math.random()) {
  return "KG-" + now.toString(36).toUpperCase().slice(-5) + Math.floor(rand * 1296).toString(36).toUpperCase().padStart(2, "0");
}
