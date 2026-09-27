// -----------------------------------------------------------------------------
// HTML pages. Plain server-rendered HTML with one small stylesheet, matching
// the look of the other apps in this repo (PrivatePDF / Streakly).
// Every value from users or Stripe goes through esc() to prevent HTML injection.
// -----------------------------------------------------------------------------

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function formatMoney(cents, currency) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${String(currency).toUpperCase()}`;
  }
}

const CSS = `
:root{--paper:#f6f6f3;--surface:#fff;--ink:#181a21;--ink-2:#4a4f5c;--muted:#767b87;--rule:#e1e1dc;--accent:#2f45c8;--accent-ink:#fff;--accent-soft:#e8ebfb;--good:#1d7a4f;--good-soft:#e3f3ea;--warn:#8a5a00;--warn-soft:#fbf0d9;--bad:#b3261e;--bad-soft:#fbe9e7;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#111318;--surface:#1a1d24;--ink:#eceef3;--ink-2:#b8bdc9;--muted:#8b90a0;--rule:#2a2e38;--accent:#7d90ff;--accent-ink:#0d1020;--accent-soft:#20264a;--good:#5fd39a;--good-soft:#16301f;--warn:#f0c46a;--warn-soft:#352a12;--bad:#ff8a80;--bad-soft:#3a1d1b;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:400 16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent)}h1,h2{margin:0;line-height:1.15;text-wrap:balance}h1{font-size:clamp(26px,5vw,36px)}h2{font-size:19px}
.top{border-bottom:1px solid var(--rule);background:var(--surface)}.top-in{max-width:880px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;gap:12px}
.brand{font-weight:800;text-decoration:none;color:var(--ink);margin-right:auto}.who{font-size:14px;color:var(--muted)}
main{max-width:880px;margin:0 auto;padding:24px 16px 56px;display:grid;gap:18px}
.card{background:var(--surface);border:1px solid var(--rule);border-radius:14px;padding:18px;display:grid;gap:12px}
.muted{color:var(--muted);margin:0}.small{font-size:14px}p{margin:0}
.btn{font:600 15px system-ui,sans-serif;display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;border-radius:10px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);cursor:pointer;text-decoration:none}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.btn.link{border:0;background:none;padding:0;color:var(--accent);font-weight:500}
form.stack{display:grid;gap:10px}label{display:grid;gap:4px;font-weight:600;font-size:14px}
input,select,textarea{font:inherit;font-weight:400;padding:9px 12px;border-radius:8px;border:1px solid var(--rule);background:var(--paper);color:var(--ink)}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.row>label{flex:1 1 160px}
.pill{display:inline-block;font-size:13px;font-weight:700;padding:3px 10px;border-radius:99px}
.pill.good{background:var(--good-soft);color:var(--good)}.pill.warn{background:var(--warn-soft);color:var(--warn)}.pill.bad{background:var(--bad-soft);color:var(--bad)}
.status{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.status div{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--rule);border-radius:10px}
.notice{padding:12px 14px;border-radius:10px;background:var(--accent-soft)}.notice.error{background:var(--bad-soft);color:var(--bad)}
.products{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}.product{display:grid;gap:8px;align-content:start}
.price{font-weight:800;font-size:20px;font-variant-numeric:tabular-nums}
code{font:13px ui-monospace,monospace;background:var(--paper);padding:2px 6px;border-radius:6px;word-break:break-all}
ul.clean{margin:0;padding-left:18px;color:var(--ink-2)}
`;

export function layout({ title, user, body }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Connect Demo</title><style>${CSS}</style></head>
<body>
<header class="top"><div class="top-in">
  <a class="brand" href="/">Connect Demo</a>
  ${user ? `<span class="who">${esc(user.name)}</span><form method="post" action="/logout"><button class="btn link" type="submit">Sign out</button></form>` : ""}
</div></header>
<main>${body}</main>
</body></html>`;
}

const notice = (msg, kind = "") => (msg ? `<p class="notice ${kind}" role="${kind === "error" ? "alert" : "status"}">${esc(msg)}</p>` : "");

// ---------------------------------------------------------------------------
export function signupPage({ users, error }) {
  return layout({
    title: "Get started",
    body: `
    <section class="card">
      <h1>Sell with Stripe Connect</h1>
      <p class="muted">Create a seller account. We create a Stripe connected account for you, then you finish onboarding with Stripe.</p>
      ${notice(error, "error")}
      <form class="stack" method="post" action="/signup">
        <label>Business or display name <input name="name" required maxlength="80" placeholder="Jane's Candles"></label>
        <label>Contact email <input name="email" type="email" required placeholder="jane@example.com"></label>
        <button class="btn primary" type="submit">Create seller account</button>
      </form>
    </section>
    ${users.length ? `
    <section class="card">
      <h2>Demo: sign in as an existing seller</h2>
      <p class="muted small">This demo has no passwords. Add real authentication before going live.</p>
      <div class="row">${users.map((u) => `
        <form method="post" action="/login/${esc(u.id)}"><button class="btn" type="submit">${esc(u.name)}</button></form>`).join("")}
      </div>
    </section>` : ""}`,
  });
}

// ---------------------------------------------------------------------------
export function dashboardPage({ user, status, statusError, flash, error, priceConfigured, subscription }) {
  const acct = user.stripeAccountId;
  const pill = (ok, okText, notText, warn = true) =>
    `<span class="pill ${ok ? "good" : warn ? "warn" : "bad"}">${esc(ok ? okText : notText)}</span>`;

  const statusHtml = statusError
    ? notice(`Couldn't load your Stripe status: ${statusError}`, "error")
    : `
      <div class="status">
        <div><span>Onboarding</span>${pill(status.onboardingComplete, "Complete", status.requirementsStatus === "past_due" ? "Past due" : "Action needed")}</div>
        <div><span>Card payments</span>${pill(status.readyToProcessPayments, "Active", status.cardPaymentsStatus === "unknown" ? "Not requested" : status.cardPaymentsStatus)}</div>
      </div>
      ${status.entriesDue.length ? `<p class="small">Stripe still needs:</p><ul class="clean small">${status.entriesDue.slice(0, 6).map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}`;

  const sub = subscription;
  const subActive = sub && ["active", "trialing", "past_due"].includes(sub.status);

  return layout({
    title: "Dashboard",
    user,
    body: `
    ${notice(flash)}${notice(error, "error")}
    <section class="card">
      <h1>${esc(user.name)}</h1>
      <p class="muted small">Connected account <code>${esc(acct)}</code></p>
      ${statusHtml}
      ${!statusError && (!status.onboardingComplete || !status.readyToProcessPayments) ? `
      <form method="post" action="/onboard"><button class="btn primary" type="submit">Onboard to collect payments</button></form>
      <p class="muted small">You'll finish setup on a secure Stripe page, then come back here.</p>` : ""}
      ${!statusError && status.onboardingComplete && status.readyToProcessPayments ? `<p class="small">You're ready to sell. Status is read live from Stripe every time you open this page.</p>` : ""}
    </section>

    <section class="card">
      <h2>Add a product</h2>
      <p class="muted small">Products are created on your connected account, so sales go straight to you.</p>
      <form class="stack" method="post" action="/products">
        <label>Name <input name="name" required maxlength="120" placeholder="Lavender candle"></label>
        <label>Description <textarea name="description" rows="2" maxlength="500" placeholder="Optional"></textarea></label>
        <div class="row">
          <label>Price <input name="price" required inputmode="decimal" placeholder="12.00"></label>
          <label>Currency <select name="currency"><option value="usd">USD</option><option value="eur">EUR</option><option value="gbp">GBP</option><option value="aud">AUD</option></select></label>
        </div>
        <button class="btn primary" type="submit">Create product</button>
      </form>
      <p class="small">Your storefront: <a href="/store/${esc(acct)}">/store/${esc(acct)}</a></p>
    </section>

    <section class="card">
      <h2>Platform subscription</h2>
      <p class="muted small">Your seller account pays the platform a monthly plan. Status updates arrive by webhook.</p>
      ${sub ? `<div class="status"><div><span>Status</span><span class="pill ${subActive ? "good" : "bad"}">${esc(sub.status)}${sub.cancelAtPeriodEnd ? " (cancels at period end)" : ""}</span></div></div>` : ""}
      ${!priceConfigured ? notice("Subscriptions aren't set up yet: set PRICE_ID in .env to a recurring price on your platform.", "error") : ""}
      <div class="row">
        ${!subActive ? `<form method="post" action="/subscribe"><button class="btn primary" type="submit"${priceConfigured ? "" : " disabled"}>Subscribe</button></form>` : ""}
        <form method="post" action="/billing-portal"><button class="btn" type="submit">Manage billing</button></form>
      </div>
    </section>`,
  });
}

// ---------------------------------------------------------------------------
export function storefrontPage({ seller, products, error, canceled }) {
  const cards = products.map((p) => {
    const price = p.default_price;
    const amount = price && typeof price === "object" && price.unit_amount != null ? formatMoney(price.unit_amount, price.currency) : null;
    return `
      <article class="card product">
        <h2>${esc(p.name)}</h2>
        ${p.description ? `<p class="muted small">${esc(p.description)}</p>` : ""}
        ${amount ? `<p class="price">${esc(amount)}</p>
        <form method="post" action="/store/${esc(seller.stripeAccountId)}/checkout">
          <input type="hidden" name="productId" value="${esc(p.id)}">
          <button class="btn primary" type="submit">Buy</button>
        </form>` : `<p class="muted small">Not for sale yet.</p>`}
      </article>`;
  }).join("");

  return layout({
    title: seller.name,
    body: `
    <section><h1>${esc(seller.name)}</h1><p class="muted">Secure checkout by Stripe.</p></section>
    ${canceled ? notice("Checkout canceled. You weren't charged.") : ""}${notice(error, "error")}
    ${products.length ? `<section class="products">${cards}</section>` : `<p class="muted">No products yet.</p>`}`,
  });
}

export function messagePage({ title, heading, message, link, user }) {
  return layout({
    title,
    user,
    body: `<section class="card"><h1>${esc(heading)}</h1><p>${esc(message)}</p>${link ? `<p><a class="btn" href="${esc(link.href)}">${esc(link.label)}</a></p>` : ""}</section>`,
  });
}
