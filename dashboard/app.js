// Stormnettle live dashboard. Sales numbers come from Stripe via /dashboard/api/stats
// when the site has a Stripe key; otherwise (and for the agent activity) data is simulated.
(() => {
  const $ = (s) => document.querySelector(s);
  let currency = "USD";
  const fmt$ = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Theme toggle (remembered per browser)
  const root = document.documentElement;
  try { const t = localStorage.getItem("sn-theme"); if (t) root.dataset.theme = t; } catch {}
  $("#theme").onclick = () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("sn-theme", root.dataset.theme); } catch {}
  };

  const AGENTS = [
    { id: "ceo", name: "CEO", icon: "🧠", role: "Strategy & priorities" },
    { id: "eng", name: "Engineer", icon: "🛠️", role: "Store, site & fixes" },
    { id: "mkt", name: "Marketing", icon: "📣", role: "Content & email" },
    { id: "ads", name: "Ads", icon: "🎯", role: "Paid acquisition" },
    { id: "sup", name: "Support", icon: "💬", role: "Customer inbox" },
    { id: "ops", name: "Ops", icon: "📦", role: "Suppliers & fulfillment" },
  ];
  const byId = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

  const ACTIONS = {
    ceo: ["Reviewed yesterday's numbers and reset priorities", "Shifted 15% of ad budget from Meta to Google Shopping", "Approved spring bundle pricing at $129", "Paused low-margin SKU 'Trail Gaiter Lite'", "Set this week's goal: 120 orders"],
    eng: ["Shipped faster checkout (−0.8s load time)", "Fixed size picker bug on mobile Safari", "Added reviews widget to product pages", "Deployed abandoned-cart email trigger", "Compressed hero images, LCP now 1.4s"],
    mkt: ["Sent 'Storm season is coming' email to 4,218 subscribers", "Posted rain-shell field test thread on X", "Published blog: 'How we waterproof seams'", "Drafted 3 TikTok scripts for the Nettle Shell", "Pitched 6 outdoor gear newsletters"],
    ads: ["Launched new Google Shopping campaign", "Killed 2 ad sets with CPA over $38", "Scaled best creative to $80/day", "Tested new headline: 'Dry in a downpour'", "ROAS for the week: 3.4x"],
    sup: ["Answered sizing question for order #SN-%o", "Processed exchange for order #SN-%o", "Resolved 'where is my order' ticket", "Sent care guide to a returning customer", "Inbox zero: 14 tickets closed today"],
    ops: ["Reordered 300 units of Nettle Shell (M, L)", "Negotiated 6% lower shipping rate", "Synced inventory across store and marketplace", "Flagged low stock: Storm Beanie (charcoal)", "Booked supplier QC call for Thursday"],
  };
  const META = { ceo: "decision", eng: "deploy", mkt: "email · social", ads: "ads", sup: "ticket", ops: "inventory" };
  const THOUGHTS = [
    "Conversion dipped on mobile overnight. Asking Engineer to check the checkout flow before scaling ads.",
    "Storm forecast for the Pacific Northwest this weekend. Moving budget to the rain-shell campaign in WA and OR.",
    "Repeat customers are 31% of revenue. Building a loyalty email series next.",
    "Ad CPA is under target for three days. Raising the daily cap by 20%.",
    "Two tickets this morning about sleeve length. Adding a fit note to the product page.",
  ];
  const PRODUCTS = [["Nettle Shell Jacket", 149], ["Storm Beanie", 29], ["Downpour Pants", 99], ["Trail Gaiter", 24], ["Gale Pack 22L", 89], ["Spring Bundle", 129]];
  const PLACES = ["Seattle, US", "Portland, US", "Vancouver, CA", "Denver, US", "Bergen, NO", "Glasgow, UK", "Boston, US", "Wellington, NZ"];
  let orderNo = 4812;

  // ---- KPIs
  const state = { revenue: 48210, mrr: 0, orders: 1194, visitors: 38902, conv: 2.9, days: 87 };
  let KPI_DEF = [
    ["revenue", "Total revenue", (v) => fmt$(v), "+18% vs last month", false],
    ["mrr", "Revenue (30d)", (v) => fmt$(v), "+12% vs prior 30d", false],
    ["orders", "Orders", (v) => v.toLocaleString(), "+41 this week", false],
    ["visitors", "Visitors (30d)", (v) => v.toLocaleString(), "+9% vs prior 30d", false],
    ["conv", "Conversion", (v) => v.toFixed(2) + "%", "−0.1 pts vs last week", true],
    ["days", "Days running", (v) => v, "0 humans on payroll"],
  ];
  function renderKpis(changed) {
    $("#kpis").innerHTML = KPI_DEF.map(([k, l, f, d, bad]) =>
      `<div class="kpi"><div class="l">${l}</div><div class="v${changed && changed.includes(k) ? " flash" : ""}">${f(state[k])}</div><div class="d ${bad === true ? "down" : bad === false ? "up" : "muted"}">${d}</div></div>`).join("");
    if (changed) setTimeout(() => document.querySelectorAll(".kpi .v.flash").forEach((e) => e.classList.remove("flash")), 900);
  }

  // ---- Revenue chart (90 days of seeded history)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let daily = Array.from({ length: 90 }, (_, i) => Math.max(40, 120 + i * 5.2 + Math.sin(i / 4) * 60 + (rnd() - 0.5) * 140 + (i % 7 >= 5 ? 90 : 0)));
  let range = 30;
  state.mrr = daily.slice(-30).reduce((a, b) => a + b, 0);
  function renderChart() {
    const data = daily.slice(-range), W = 600, H = 200, P = 8;
    const max = Math.max(...data, 1) * 1.1;
    const x = (i) => P + (i * (W - 2 * P)) / (data.length - 1), y = (v) => H - P - (v / max) * (H - 2 * P);
    const line = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const grid = [0.25, 0.5, 0.75].map((g) => `<line x1="0" x2="${W}" y1="${H * g}" y2="${H * g}" stroke="var(--line)" stroke-dasharray="3 4"/>`).join("");
    $("#chart").innerHTML = `<defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".25"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${grid}
      <path d="${line}L${x(data.length - 1)},${H}L${x(0)},${H}Z" fill="url(#g)"/>
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <line id="hover" y1="0" y2="${H}" stroke="var(--muted)" stroke-width="1" vector-effect="non-scaling-stroke" visibility="hidden"/>`;
    const total = data.reduce((a, b) => a + b, 0);
    $("#rev-total").textContent = fmt$(total);
    $("#rev-sub").textContent = `last ${range} days`;
  }
  const chart = $("#chart"), tip = $("#tip");
  chart.addEventListener("mousemove", (e) => {
    const data = daily.slice(-range), r = chart.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (data.length - 1));
    const d = new Date(); d.setDate(d.getDate() - (data.length - 1 - i));
    const hx = 8 + (i * 584) / (data.length - 1);
    const h = $("#hover"); h.setAttribute("x1", hx); h.setAttribute("x2", hx); h.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.textContent = `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${fmt$(data[i])}`;
    const cr = chart.parentElement.getBoundingClientRect();
    tip.style.left = Math.min(e.clientX - cr.left + 10, cr.width - 130) + "px";
    tip.style.top = r.top - cr.top + 8 + "px";
  });
  chart.addEventListener("mouseleave", () => { tip.hidden = true; const h = $("#hover"); h && h.setAttribute("visibility", "hidden"); });
  $("#range").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    range = +b.dataset.d;
    document.querySelectorAll("#range button").forEach((x) => x.classList.toggle("on", x === b));
    renderChart();
  };

  // ---- Activity feed
  const feed = [];
  let filter = "all";
  $("#filter").innerHTML = `<button data-f="all" class="on">All</button>` + AGENTS.map((a) => `<button data-f="${a.id}" title="${a.name}">${a.icon}</button>`).join("");
  $("#filter").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    filter = b.dataset.f;
    document.querySelectorAll("#filter button").forEach((x) => x.classList.toggle("on", x === b));
    renderFeed();
  };
  function ago(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return s < 5 ? "just now" : s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    return Math.floor(s / 3600) + "h ago";
  }
  function makeEvent(agent, t) {
    return { agent, t, text: pick(ACTIONS[agent]).replace("%o", 4700 + Math.floor(Math.random() * 110)) };
  }
  function feedItem(ev) {
    const a = byId[ev.agent];
    return `<li><div class="av">${a.icon}</div><div><div><span class="who">${a.name}</span><span class="when">${ago(ev.t)}</span></div><div class="what">${esc(ev.text)}</div><div class="meta">${META[ev.agent]}</div></div></li>`;
  }
  function renderFeed() {
    $("#feed").innerHTML = feed.filter((e) => filter === "all" || e.agent === filter).slice(0, 40).map(feedItem).join("");
  }
  function pushEvent(ev) {
    feed.unshift(ev);
    if (filter === "all" || filter === ev.agent) {
      $("#feed").insertAdjacentHTML("afterbegin", feedItem(ev));
      const items = $("#feed").children; if (items.length > 40) items[items.length - 1].remove();
    }
    const a = agentState[ev.agent]; a.status = "working"; a.doing = ev.text;
    renderAgents();
  }

  // ---- Agents
  const agentState = Object.fromEntries(AGENTS.map((a) => [a.id, { status: "idle", doing: a.role }]));
  function renderAgents() {
    const working = Object.values(agentState).filter((s) => s.status === "working").length;
    $("#agent-count").textContent = `${working}/${AGENTS.length} working`;
    $("#agents").innerHTML = AGENTS.map((a) => {
      const s = agentState[a.id];
      return `<li><div class="av">${a.icon}</div><div class="info"><div class="nm">${a.name}</div><div class="st">${esc(s.doing)}</div></div><span class="dot ${s.status}" title="${s.status}"></span></li>`;
    }).join("");
  }

  // ---- Tasks
  const tasks = [
    ["Write product copy for Gale Pack 22L", "mkt", "queued"],
    ["A/B test free-shipping threshold ($75 vs $99)", "ceo", "queued"],
    ["Set up Pinterest catalog", "ads", "queued"],
    ["Migrate product images to CDN", "eng", "doing"],
    ["Build loyalty email series", "mkt", "doing"],
    ["Negotiate bulk rate with zipper supplier", "ops", "doing"],
    ["Launch spring bundle", "ceo", "done"],
    ["Fix mobile size picker", "eng", "done"],
    ["Clear support backlog", "sup", "done"],
  ].map(([title, agent, col]) => ({ title, agent, col }));
  const BACKLOG = ["Add Klarna at checkout", "Record unboxing video", "Translate store to German", "Retarget cart abandoners on Meta", "Write FAQ on jacket care", "Audit return reasons for Q3"];
  function renderTasks() {
    const cols = [["queued", "Queued"], ["doing", "In progress"], ["done", "Done"]];
    $("#board").innerHTML = cols.map(([k, l]) => {
      const list = tasks.filter((t) => t.col === k);
      return `<div class="col"><h3>${l} · ${list.length}</h3>${list.map((t) => `<div class="task ${k === "done" ? "done" : ""}"><div class="tt">${esc(t.title)}</div><div class="tg">${byId[t.agent].icon} ${byId[t.agent].name}</div></div>`).join("")}</div>`;
    }).join("");
    $("#task-count").textContent = `${tasks.filter((t) => t.col === "done").length} shipped`;
  }
  function advanceTask() {
    const doing = tasks.filter((t) => t.col === "doing");
    const queued = tasks.filter((t) => t.col === "queued");
    if (doing.length && Math.random() < 0.6) {
      const t = pick(doing); t.col = "done";
      tasks.splice(tasks.indexOf(t), 1); tasks.push(t);
      pushEvent({ agent: t.agent, t: Date.now(), text: `Completed: ${t.title}` });
    } else if (queued.length) {
      const t = queued[0]; t.col = "doing";
      pushEvent({ agent: t.agent, t: Date.now(), text: `Started: ${t.title}` });
    }
    if (tasks.filter((t) => t.col === "queued").length < 2 && BACKLOG.length) {
      tasks.unshift({ title: BACKLOG.shift(), agent: pick(AGENTS).id, col: "queued" });
    }
    const done = tasks.filter((t) => t.col === "done");
    if (done.length > 5) tasks.splice(tasks.indexOf(done[0]), 1);
    renderTasks();
  }

  // ---- Orders
  const orders = [];
  function newOrder(fresh) {
    const [name, price] = pick(PRODUCTS), qty = Math.random() < 0.2 ? 2 : 1;
    return { no: orderNo++, name, qty, amount: price * qty, place: pick(PLACES), fresh };
  }
  function renderOrders() {
    $("#orders").innerHTML = orders.slice(0, 6).map((o) =>
      `<tr class="${o.fresh ? "new" : ""}"><td class="muted">${o.label || "#SN-" + o.no}</td><td>${esc(o.name)}${o.qty > 1 ? " ×" + o.qty : ""}</td><td class="muted">${o.place}</td><td class="r">${fmt$(o.amount)}</td></tr>`).join("");
    orders.forEach((o) => (o.fresh = false));
  }

  // ---- Channels
  let channels = [["Google Shopping", 38], ["Email", 24], ["Organic search", 17], ["X / social", 12], ["Direct", 9]];
  function renderChannels() {
    const max = Math.max(...channels.map((c) => c[1]));
    $("#channels").innerHTML = channels.map(([n, v]) =>
      `<li><div class="row"><span>${n}</span><span class="muted">${v}%</span></div><div class="track"><div class="fill" style="width:${(v / max) * 100}%"></div></div></li>`).join("");
  }

  // ---- CEO thought (typewriter)
  let cycle = 412, thoughtIdx = 0, typing;
  function think() {
    const text = THOUGHTS[thoughtIdx++ % THOUGHTS.length];
    $("#ceo-cycle").textContent = `cycle #${cycle++}`;
    let i = 0; clearInterval(typing);
    typing = setInterval(() => {
      $("#ceo-thought").textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(typing);
    }, 22);
  }

  // ---- Seed initial state
  const now = Date.now();
  for (let i = 0; i < 18; i++) feed.push(makeEvent(pick(AGENTS).id, now - (i + 1) * (60000 + Math.random() * 600000)));
  feed.sort((a, b) => b.t - a.t);
  for (let i = 0; i < 6; i++) orders.unshift(newOrder(false));
  ["eng", "mkt", "ops"].forEach((id) => { agentState[id] = { status: "working", doing: tasks.find((t) => t.agent === id && t.col === "doing").title }; });
  agentState.sup = { status: "waiting", doing: "Waiting on customer reply" };
  renderKpis(); renderChart(); renderFeed(); renderAgents(); renderTasks(); renderOrders(); renderChannels(); think();

  // ---- Live loop
  const tick = () => {
    $("#clock").textContent = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };
  tick(); setInterval(tick, 1000);

  setInterval(() => {
    const r = Math.random();
    if (r < 0.35 && !real) {
      const o = newOrder(true); orders.unshift(o); orders.length = Math.min(orders.length, 12);
      state.revenue += o.amount; state.mrr += o.amount; state.orders += 1; daily[daily.length - 1] += o.amount;
      renderOrders(); renderKpis(["revenue", "mrr", "orders"]); renderChart();
      pushEvent({ agent: "ops", t: Date.now(), text: `New order #SN-${o.no}: ${o.name} (${fmt$(o.amount)}) from ${o.place}` });
    } else if (r < 0.55) {
      advanceTask();
    } else {
      pushEvent(makeEvent(pick(AGENTS).id, Date.now()));
    }
    // Agents drift back to idle
    AGENTS.forEach((a) => { if (agentState[a.id].status === "working" && Math.random() < 0.15) agentState[a.id] = { status: "idle", doing: a.role }; });
    state.visitors += Math.floor(Math.random() * 6);
    renderAgents();
  }, 3500);

  setInterval(think, 14000);

  // ---- Real sales from Stripe
  let real = null;
  const country = (code) => { try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code); } catch { return code; } };
  const change = (now, before, unit) => {
    if (!before) return now ? [`new this month`, false] : ["no sales yet", false];
    const pct = Math.round(((now - before) / before) * 100);
    return [`${pct >= 0 ? "+" : "−"}${Math.abs(pct)}% vs prior 30d`, pct < 0];
  };
  function applyReal(data) {
    const seen = new Set((real?.recent || []).map((o) => o.ref));
    const firstLoad = !real;
    real = data;
    currency = data.currency.toUpperCase();
    const major = (n) => n / 100; // Stripe amounts are in cents
    Object.assign(state, {
      revenue: major(data.revenue), mrr: major(data.last30), orders: data.orders30,
      avg: major(data.averageOrder), customers: data.customers,
      days: data.firstSale ? Math.max(1, Math.ceil((Date.now() - Date.parse(data.firstSale)) / 864e5)) : 0,
    });
    const [revD, revBad] = change(data.last30, data.prev30);
    const [ordD, ordBad] = change(data.orders30, data.prevOrders30);
    KPI_DEF = [
      ["revenue", "Total revenue", (v) => fmt$(v), `${data.orders.toLocaleString()} orders all time`],
      ["mrr", "Revenue (30d)", (v) => fmt$(v), revD, revBad],
      ["orders", "Orders (30d)", (v) => v.toLocaleString(), ordD, ordBad],
      ["avg", "Average order", (v) => fmt$(v), "all time"],
      ["customers", "Customers", (v) => v.toLocaleString(), "unique buyers"],
      ["days", "Days selling", (v) => v, data.firstSale ? `first sale ${data.firstSale}` : "no sales yet"],
    ];
    daily = data.daily.map((d) => major(d.amount));
    orders.length = 0;
    data.recent.forEach((o) => orders.push({
      label: "#" + o.ref, name: o.item || "Payment", qty: 1, amount: major(o.amount),
      place: o.country ? country(o.country) : "—", fresh: !firstLoad && !seen.has(o.ref),
    }));
    if (!orders.length) $("#orders").innerHTML = "";
    channels = data.countries.length
      ? (() => { const t = data.countries.reduce((a, c) => a + c.amount, 0); return data.countries.map((c) => [country(c.code), Math.round((c.amount / t) * 100)]); })()
      : [["No sales yet", 0]];
    $("#channels-title").textContent = "Sales by country";
    const mode = data.livemode === false ? "test mode" : "live";
    $("#src").textContent = `Stripe · ${mode}`;
    $("#src").classList.add("on");
    $("#foot").textContent = `Sales from Stripe (${mode}), refreshed every 5 minutes${data.otherCurrencies.length ? `, ${currency} only` : ""} · agent activity is simulated`;
    if (!firstLoad) data.recent.filter((o) => !seen.has(o.ref)).reverse().forEach((o) =>
      pushEvent({ agent: "ops", t: o.created, text: `New order #${o.ref}: ${fmt$(major(o.amount))}${o.country ? " from " + country(o.country) : ""}` }));
    renderKpis(firstLoad ? null : ["revenue", "mrr", "orders"]); renderChart(); renderOrders(); renderChannels();
    if (!orders.length) $("#orders").innerHTML = `<tr><td colspan="4" class="muted">No sales yet</td></tr>`;
  }
  async function loadReal() {
    try {
      const res = await fetch("api/stats", { headers: { accept: "application/json" } });
      if (res.ok) applyReal(await res.json());
    } catch { /* offline or no server: keep demo data */ }
  }
  loadReal();
  setInterval(loadReal, 5 * 60 * 1000);
  setInterval(() => document.querySelectorAll("#feed .when").forEach((el, i) => {
    const list = feed.filter((e) => filter === "all" || e.agent === filter);
    if (list[i]) el.textContent = ago(list[i].t);
  }), 10000);
})();
