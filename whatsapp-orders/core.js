// Pure ordering conversation (no network, no files), so it can be unit-tested with `node --test`.
//
// A business:  { id, name, currency, paidUntil: "YYYY-MM-DD", delivery: { enabled, fee }, menu: [{ name, price }] }
// A session:   { step, cart: { [menuIndex]: qty }, name, fulfilment, address }
// Prices are in cents.

export function formatMoney(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

// Paid through the end of `paidUntil` (inclusive).
export function isActive(business, now = new Date()) {
  return Boolean(business.paidUntil) && now.toISOString().slice(0, 10) <= business.paidUntil;
}

export function newSession() {
  return { step: "browsing", cart: {} };
}

export function menuText(business) {
  const lines = [`*${business.name} menu*`];
  let category = null;
  business.menu.forEach((item, i) => {
    if (item.category && item.category !== category) {
      category = item.category;
      lines.push("", `_${category}_`);
    }
    lines.push(`${i + 1}. ${item.name} - ${formatMoney(item.price, business.currency)}`);
  });
  lines.push("", "Reply with item numbers to add (e.g. *2* or *3x2* or *1, 4x3*).", "*cart* to view, *done* to order.");
  return lines.join("\n");
}

// "1, 3x2, 4 x 3" -> [{ index: 0, qty: 1 }, { index: 2, qty: 2 }, { index: 3, qty: 3 }], or null if not an item list.
export function parseItems(text, menuLength) {
  const parts = String(text).toLowerCase().replace(/\s*[x*]\s*/g, "x").split(/[\s,;]+/).filter(Boolean);
  if (!parts.length) return null;
  const items = [];
  for (const part of parts) {
    const m = part.match(/^(\d+)(?:x(\d+))?$/);
    if (!m) return null;
    const index = Number(m[1]) - 1;
    const qty = m[2] ? Number(m[2]) : 1;
    if (index < 0 || index >= menuLength || qty < 1 || qty > 50) return null;
    items.push({ index, qty });
  }
  return items;
}

export function cartLines(business, cart) {
  return Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([i, qty]) => {
      const item = business.menu[i];
      return { name: item.name, qty, lineTotal: item.price * qty };
    });
}

export function cartTotal(business, session) {
  const subtotal = cartLines(business, session.cart).reduce((n, l) => n + l.lineTotal, 0);
  const deliveryFee = session.fulfilment === "delivery" ? business.delivery?.fee || 0 : 0;
  return { subtotal, deliveryFee, total: subtotal + deliveryFee };
}

export function cartText(business, session) {
  const lines = cartLines(business, session.cart);
  if (!lines.length) return "Your cart is empty. Send *menu* to see what we have.";
  const money = (c) => formatMoney(c, business.currency);
  const { subtotal, deliveryFee, total } = cartTotal(business, session);
  const out = lines.map((l) => `${l.qty} x ${l.name} - ${money(l.lineTotal)}`);
  if (deliveryFee) out.push(`Delivery - ${money(deliveryFee)}`);
  out.push(`*Total: ${money(deliveryFee ? total : subtotal)}*`);
  return out.join("\n");
}

export function ownerOrderText(business, order) {
  return [
    `🛎️ New order #${order.number} - ${business.name}`,
    `From: ${order.name} (+${order.customer})`,
    order.fulfilment === "delivery" ? `Delivery to: ${order.address}` : "Pickup",
    "",
    ...order.lines.map((l) => `${l.qty} x ${l.name}`),
    "",
    `Total: ${formatMoney(order.total, business.currency)}`,
  ].join("\n");
}

const GREETING = /^(hi|hello|hey|hola|start|menu|order)\b/i;

// Returns { session, replies: string[], order?: {...} }. `order` is set when the customer confirms.
export function handleMessage(business, session, text, { now = new Date() } = {}) {
  const input = String(text || "").trim();
  const lower = input.toLowerCase();
  const s = { ...session, cart: { ...session.cart } };
  const reply = (...replies) => ({ session: s, replies });

  if (!isActive(business, now)) {
    return { session, replies: [business.pausedMessage || `${business.name} isn't taking WhatsApp orders right now. Please contact us directly.`] };
  }

  if (lower === "cancel" || lower === "clear") {
    return { session: newSession(), replies: ["Order cleared. Send *menu* to start again."] };
  }

  switch (s.step) {
    case "name":
      if (!input) return reply("What name should we put on the order?");
      s.name = input.slice(0, 60);
      if (business.delivery?.enabled) {
        s.step = "fulfilment";
        return reply(`Thanks ${s.name}! Reply *1* for pickup or *2* for delivery (+${formatMoney(business.delivery.fee || 0, business.currency)}).`);
      }
      s.fulfilment = "pickup";
      s.step = "confirm";
      return reply(confirmText(business, s));

    case "fulfilment":
      if (lower === "1" || lower.startsWith("pick")) {
        s.fulfilment = "pickup";
        s.step = "confirm";
        return reply(confirmText(business, s));
      }
      if (lower === "2" || lower.startsWith("deliv")) {
        s.fulfilment = "delivery";
        s.step = "address";
        return reply("What's the delivery address?");
      }
      return reply("Reply *1* for pickup or *2* for delivery.");

    case "address":
      if (input.length < 5) return reply("Please send the full delivery address.");
      s.address = input.slice(0, 200);
      s.step = "confirm";
      return reply(confirmText(business, s));

    case "confirm":
      if (/^(y|yes|confirm|ok)$/i.test(input)) {
        const order = {
          name: s.name,
          fulfilment: s.fulfilment,
          address: s.address || null,
          lines: cartLines(business, s.cart),
          ...cartTotal(business, s),
        };
        return {
          session: newSession(),
          replies: [business.confirmMessage || "✅ Order received! We'll message you when it's ready."],
          order,
        };
      }
      if (/^(n|no|back|edit)$/i.test(input)) {
        s.step = "browsing";
        return reply("No problem. Keep adding items, or send *cart* to review.");
      }
      return reply("Reply *yes* to place the order or *no* to keep editing.");
  }

  // Browsing.
  if (GREETING.test(input)) {
    const hello = business.greeting || `Hi! 👋 Welcome to ${business.name}.`;
    return reply(hello, menuText(business));
  }
  if (lower === "cart") return reply(cartText(business, s));
  const remove = lower.match(/^remove\s+(\d+)$/);
  if (remove) {
    delete s.cart[Number(remove[1]) - 1];
    return reply(cartText(business, s));
  }
  if (/^(done|checkout|finish|that'?s all)$/i.test(input)) {
    if (!cartLines(business, s.cart).length) return reply("Your cart is empty. Reply with item numbers first.");
    s.step = "name";
    return reply("Great! What name should we put on the order?");
  }
  const items = parseItems(input, business.menu.length);
  if (items) {
    for (const { index, qty } of items) s.cart[index] = (s.cart[index] || 0) + qty;
    return reply(`Added. ${cartText(business, s)}\n\nAdd more, or send *done* to order.`);
  }
  return reply("Sorry, I didn't get that. Send *menu* to see items, *cart* to review, or *done* to order.");
}

function confirmText(business, s) {
  const where = s.fulfilment === "delivery" ? `Delivery to: ${s.address}` : "Pickup";
  return `Please confirm your order:\n\n${cartText(business, s)}\n${where}\nName: ${s.name}\n\nReply *yes* to place it or *no* to edit.`;
}
