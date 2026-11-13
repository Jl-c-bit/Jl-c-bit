'use strict';

(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    for (const k of kids) if (k != null) n.append(k);
    return n;
  };
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
    clear: () => { try { sessionStorage.clear(); } catch {} },
  };

  let socket = null;
  let state = null;
  let reportFilter = 'open';
  let pending = null; // { kind: 'ban'|'warn', userId?, reportId?, name }

  // ---------- helpers ----------
  function ago(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }
  function until(t) {
    if (!t) return 'permanent';
    const m = Math.round((t - Date.now()) / 60000);
    return m < 60 ? `${m}m left` : m < 1440 ? `${Math.round(m / 60)}h left` : `${Math.round(m / 1440)}d left`;
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 3000);
  }
  function act(event, payload, okMsg) {
    socket.emit(event, payload, (res) => toast(res && res.ok ? okMsg : (res && res.error) || 'Action failed.'));
  }
  function btn(label, cls, onclick) {
    return el('button', { className: `small ${cls}`, textContent: label, onclick });
  }
  const online = (id) => state && state.users.some((u) => u.id === id);

  // ---------- login ----------
  function connect(name, password) {
    $('#login-error').textContent = '';
    socket = io('/mod', { auth: { name, password }, reconnectionAttempts: 20 });
    socket.on('connect', () => {
      store.set('mod-name', name);
      store.set('mod-pass', password);
      $('#login').hidden = true;
      $('#dash').hidden = false;
      $('#whoami').textContent = `signed in as ${name}`;
      setConn('live');
    });
    socket.on('connect_error', (err) => {
      const msg = {
        unauthorized: 'Wrong password.',
        locked: 'Too many failed attempts. Try again in 15 minutes.',
        disabled: 'The dashboard is disabled. Set MOD_PASSWORD on the server (12+ characters).',
      }[err.message];
      if (msg) {
        socket.disconnect();
        store.clear();
        $('#dash').hidden = true;
        $('#login').hidden = false;
        $('#login-error').textContent = msg;
      } else {
        setConn('down');
      }
    });
    socket.on('disconnect', () => setConn('down'));
    socket.on('state', (s) => {
      state = s;
      render();
    });
  }
  function setConn(kind) {
    const c = $('#conn');
    c.className = 'pill ' + kind;
    c.textContent = kind === 'live' ? 'live' : 'reconnecting…';
  }

  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    connect(String(fd.get('name')).trim(), String(fd.get('password')));
  });
  $('#logout').onclick = () => {
    store.clear();
    socket?.disconnect();
    location.reload();
  };
  if (store.get('mod-pass')) connect(store.get('mod-name') || 'moderator', store.get('mod-pass'));

  // ---------- tabs ----------
  for (const b of document.querySelectorAll('.mod-tabs button')) {
    b.addEventListener('click', () => {
      for (const x of document.querySelectorAll('.mod-tabs button')) x.classList.toggle('active', x === b);
      for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== b.dataset.tab;
    });
  }
  for (const r of document.querySelectorAll('input[name=rfilter]')) {
    r.addEventListener('change', () => {
      reportFilter = r.value;
      render();
    });
  }
  $('#user-search').addEventListener('input', () => render());

  // ---------- dialogs ----------
  function openBan(target) {
    pending = { kind: 'ban', ...target };
    $('#ban-name').textContent = target.name;
    $('#ban-form').reset();
    $('#ban-dlg').showModal();
  }
  function openWarn(target) {
    pending = { kind: 'warn', ...target };
    $('#warn-name').textContent = target.name;
    $('#warn-dlg').showModal();
  }
  $('#ban-dlg').addEventListener('close', () => {
    if ($('#ban-dlg').returnValue !== 'ban' || !pending) return;
    const fd = new FormData($('#ban-form'));
    act('ban', { userId: pending.userId, reportId: pending.reportId, length: fd.get('length'), reason: fd.get('reason') }, `${pending.name} banned.`);
    pending = null;
  });
  $('#warn-dlg').addEventListener('close', () => {
    if ($('#warn-dlg').returnValue !== 'warn' || !pending) return;
    const text = new FormData($('#warn-form')).get('text');
    act('warn', { userId: pending.userId, text }, `Warning sent to ${pending.name}.`);
    pending = null;
  });

  // ---------- rendering ----------
  function render() {
    if (!state) return;
    const st = state.stats;
    $('#s-open').textContent = st.openReports;
    $('#s-online').textContent = st.online;
    $('#s-chats').textContent = st.chats;
    $('#s-bans').textContent = st.bans;
    $('#s-open').parentElement.classList.toggle('alert', st.openReports > 0);
    $('#b-reports').textContent = st.openReports || '';
    const db = $('#db');
    db.hidden = false;
    db.className = 'pill ' + (state.persistent ? 'live' : 'down');
    db.textContent = state.persistent ? 'saved to database' : 'no database';
    $('#age-pill').hidden = false;
    $('#age-pill').className = 'pill ' + (state.ageCheck === 'connectid' ? 'live' : 'down');
    $('#age-pill').textContent = { connectid: 'age check: ConnectID', mock: 'age check: PRETEND BANK', none: 'age check: self-declared' }[state.ageCheck] || state.ageCheck;
    db.title = state.persistent ? '' : 'Bans and reports will be lost when the server restarts. Set DATABASE_URL.';
    $('#persist-note').textContent = state.persistent
      ? ' Bans are saved and survive restarts.'
      : ' No database is connected, so bans are cleared if the server restarts.';
    document.title = (st.openReports ? `(${st.openReports}) ` : '') + 'Afterhours Moderation';
    renderReports();
    renderUsers();
    renderBans();
    renderActivity();
  }

  function renderReports() {
    const ul = $('#reports');
    ul.textContent = '';
    const list = state.reports.filter((r) => reportFilter === 'all' || r.status === 'open' || (r.outcome || '').includes('please review'));
    if (!list.length) return ul.append(el('li', { className: 'empty', textContent: reportFilter === 'open' ? 'No open reports. 🎉' : 'No reports yet.' }));

    for (const r of list) {
      const t = r.target;
      const isOnline = online(t.id);
      const li = el('li', { className: 'item' + (r.reason === 'underage' ? ' urgent' : '') + (r.status === 'resolved' ? ' resolved' : '') });
      li.append(
        el('div', { className: 'item-head' },
          el('span', { className: 'reason ' + r.reason, textContent: r.reason }),
          el('strong', { textContent: `${t.nickname}, ${t.age}` }),
          el('span', { className: 'muted', textContent: `reported by ${r.reporter}` }),
          el('span', { className: 'when', textContent: ago(r.at) })),
        el('p', { className: 'small muted', textContent: `${t.gender}${t.city ? ' · ' + t.city : ''} · ${r.targetReports} report(s) · ${isOnline ? 'online' : 'offline'} · ` },
          el('span', { className: 'mono', textContent: t.ipTag })),
        t.bio ? el('p', { textContent: `Bio: ${t.bio}` }) : null,
      );

      const ex = el('div', { className: 'excerpt' });
      if (r.excerpt.length) {
        for (const m of r.excerpt) {
          ex.append(el('div', {}, el('b', { className: m.from === t.nickname ? 'target' : '', textContent: m.from + ': ' }), m.text));
        }
      } else {
        ex.append(el('span', { className: 'muted', textContent: 'No chat between them — reported from the lobby.' }));
      }
      li.append(ex);
      if (r.outcome) li.append(el('p', { className: 'outcome', textContent: r.outcome }));

      const row = el('div', { className: 'row' });
      if (r.status === 'open' || (r.outcome || '').includes('please review')) {
        row.append(btn(isOnline ? 'Ban…' : 'Set ban…', 'danger', () => openBan({ userId: isOnline ? t.id : null, reportId: r.id, name: t.nickname })));
        if (isOnline) {
          row.append(btn('Kick', '', () => act('kick', { userId: t.id }, `${t.nickname} kicked.`)));
          row.append(btn('Warn…', '', () => openWarn({ userId: t.id, name: t.nickname })));
        }
        const auto = (r.outcome || '').startsWith('Auto-removed');
        row.append(btn(auto ? 'Confirm auto-action' : 'Dismiss', 'ghost', () =>
          act('resolve', { reportId: r.id, outcome: auto ? 'Auto-action confirmed' : 'Dismissed' }, 'Report closed.')));
        if (auto) {
          const ban = state.bans.find((b) => b.ipTag === t.ipTag);
          if (ban) row.append(btn('Lift ban', 'ghost', () => {
            act('unban', { banId: ban.id }, 'Ban lifted.');
            act('resolve', { reportId: r.id, outcome: 'Auto-ban lifted' }, 'Ban lifted.');
          }));
        }
      }
      if (row.childElementCount) li.append(row);
      ul.append(li);
    }
  }

  function renderUsers() {
    const ul = $('#users');
    ul.textContent = '';
    const q = $('#user-search').value.trim().toLowerCase();
    const list = state.users
      .filter((u) => !q || [u.nickname, u.city, u.bio].join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.reports - a.reports || b.strikes - a.strikes || b.joinedAt - a.joinedAt);
    if (!list.length) return ul.append(el('li', { className: 'empty', textContent: q ? 'Nobody matches.' : 'Nobody online.' }));
    for (const u of list) {
      const flags = [];
      if (u.reports) flags.push(`${u.reports} report(s)`);
      if (u.strikes) flags.push(`${u.strikes} filter strike(s)`);
      ul.append(el('li', { className: 'item' + (u.reports >= 2 || u.strikes ? ' urgent' : '') },
        el('div', { className: 'item-head' },
          el('strong', { textContent: `${u.nickname}, ${u.age}` }),
          el('span', { className: 'muted', textContent: `${u.gender}${u.city ? ' · ' + u.city : ''} · ${u.intents.join(', ')}` }),
          el('span', { className: 'when', textContent: `joined ${ago(u.joinedAt)}` })),
        u.bio ? el('p', { textContent: u.bio }) : null,
        el('p', { className: 'small' },
          flags.length ? el('span', { className: 'flag', textContent: '⚑ ' + flags.join(' · ') + ' · ' }) : null,
          el('span', { className: 'muted', textContent: `${u.chats} active chat(s) · ` }),
          el('span', { className: 'mono', textContent: u.ipTag })),
        el('div', { className: 'row' },
          btn('Warn…', '', () => openWarn({ userId: u.id, name: u.nickname })),
          btn('Kick', '', () => act('kick', { userId: u.id }, `${u.nickname} kicked.`)),
          btn('Ban…', 'danger', () => openBan({ userId: u.id, name: u.nickname })))));
    }
  }

  function renderBans() {
    const ul = $('#bans');
    ul.textContent = '';
    if (!state.bans.length) return ul.append(el('li', { className: 'empty', textContent: 'No active bans.' }));
    for (const b of [...state.bans].sort((x, y) => y.at - x.at)) {
      ul.append(el('li', { className: 'item' },
        el('div', { className: 'item-head' },
          el('strong', { textContent: b.nickname || '(no nickname)' }),
          el('span', { className: 'mono', textContent: b.ipTag }),
          el('span', { className: 'when', textContent: `${ago(b.at)} · ${until(b.until)}` })),
        el('p', { textContent: b.reason }),
        el('p', { className: 'small muted', textContent: `by ${b.by}` }),
        el('div', { className: 'row' }, btn('Lift ban', 'ghost', () => act('unban', { banId: b.id }, 'Ban lifted.')))));
    }
  }

  function renderActivity() {
    const ul = $('#activity');
    ul.textContent = '';
    if (!state.activity.length) return ul.append(el('li', { className: 'empty', textContent: 'Nothing yet.' }));
    for (const a of state.activity) {
      ul.append(el('li', {},
        el('time', { textContent: new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }),
        el('span', { className: 'type ' + a.type, textContent: a.type }),
        el('span', { textContent: a.text })));
    }
  }

  // Keep relative times fresh.
  setInterval(() => state && render(), 30_000);
})();
