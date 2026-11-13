'use strict';

(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const show = (id) => {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  };

  const INTENT_LABEL = { chat: 'chatting', flirt: 'flirting', dating: 'dating', hookup: 'hookups' };
  const socket = io({ autoConnect: false });
  let me = null;
  const chats = new Map(); // chatId -> { with, pane, tab }
  let activeChat = null;
  let reportTarget = null;

  // ---------- gate & age check ----------
  function showJoin() {
    show('join');
    const max = new Date();
    max.setFullYear(max.getFullYear() - 18);
    $('input[name=dob]').max = max.toISOString().slice(0, 10);
  }

  async function ageStatus() {
    try {
      return await (await fetch('/verify/status', { cache: 'no-store' })).json();
    } catch {
      return { required: false, verified: true };
    }
  }

  function bankButton(b) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'bank';
    btn.type = 'button';
    if (b.logo) {
      const img = document.createElement('img');
      img.src = b.logo;
      img.alt = '';
      img.loading = 'lazy';
      btn.append(img);
    }
    btn.append(document.createTextNode(b.name));
    btn.addEventListener('click', async () => {
      for (const x of document.querySelectorAll('.bank')) x.disabled = true;
      $('#verify-msg').textContent = '';
      try {
        const res = await fetch('/verify/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bankId: b.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not reach your bank.');
        location.assign(data.authUrl);
      } catch (err) {
        $('#verify-msg').textContent = err.message;
        for (const x of document.querySelectorAll('.bank')) x.disabled = false;
      }
    });
    li.append(btn);
    return li;
  }

  async function showVerify(message = '') {
    show('verify');
    $('#verify-msg').textContent = message;
    const ul = $('#banks');
    try {
      const res = await fetch('/verify/banks', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      ul.textContent = '';
      const main = data.banks.filter((b) => !b.fallback);
      const fallback = data.banks.filter((b) => b.fallback);
      main.sort((a, b) => a.name.localeCompare(b.name)).forEach((b) => ul.append(bankButton(b)));
      if (!main.length) ul.innerHTML = '<li class="muted small">No banks are available right now.</li>';
      $('#fallback').textContent = '';
      fallback.forEach((b) => $('#fallback').append(bankButton(b)));
      $('#fallback-wrap').hidden = !fallback.length;
    } catch (err) {
      ul.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'error';
      li.textContent = err.message || 'Age verification is unavailable right now.';
      ul.append(li);
    }
  }

  async function enter() {
    const s = await ageStatus();
    if (s.required && !s.verified) return showVerify();
    showJoin();
  }

  $('#gate-yes').addEventListener('click', enter);

  // ---------- join ----------
  $('#join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const fd = new FormData(f);
    const payload = {
      nickname: fd.get('nickname'),
      dob: fd.get('dob'),
      gender: fd.get('gender'),
      seeking: fd.getAll('seeking'),
      intents: fd.getAll('intents'),
      city: fd.get('city'),
      bio: fd.get('bio'),
      confirmAdult: f.confirmAdult.checked,
      agreeRules: f.agreeRules.checked,
      consentData: f.consentData.checked,
    };
    $('#join-error').textContent = '';
    if (!socket.connected) socket.connect();
    socket.emit('join', payload, (res) => {
      if (res.needsVerification) return void showVerify(res.error);
      if (!res.ok) return void ($('#join-error').textContent = res.error);
      me = res.me;
      $('#me-label').textContent = `${me.nickname}, ${me.age}`;
      show('main');
    });
  });

  // ---------- lobby ----------
  function tag(text, cls = '') {
    const s = document.createElement('span');
    s.className = 'tag ' + cls;
    s.textContent = text;
    return s;
  }

  socket.on('lobby', (list) => {
    const ul = $('#lobby-list');
    ul.textContent = '';
    $('#count').textContent = `(${list.length})`;
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'muted small';
      li.textContent = 'Nobody matching your preferences is online yet. Stay a while, or widen your "interested in" options.';
      ul.append(li);
    }
    for (const p of list) {
      const node = $('#person-tpl').content.firstElementChild.cloneNode(true);
      $('.name', node).textContent = p.nickname;
      $('.meta', node).textContent = `${p.age} · ${p.gender}${p.city ? ' · ' + p.city : ''}`;
      for (const i of p.intents) $('.tags', node).append(tag(INTENT_LABEL[i] || i, i));
      $('.bio', node).textContent = p.bio;
      const reqBtn = $('.req', node);
      if ([...chats.values()].some((c) => c.with.id === p.id)) {
        reqBtn.disabled = true;
        reqBtn.textContent = 'Chatting';
      }
      reqBtn.addEventListener('click', () => {
        reqBtn.disabled = true;
        socket.emit('request', p.id, (res) => {
          reqBtn.textContent = res.ok ? 'Requested' : res.error || 'Unavailable';
        });
      });
      $('.block', node).addEventListener('click', () => socket.emit('block', p.id));
      $('.report', node).addEventListener('click', () => openReport(p));
      ul.append(node);
    }
  });

  socket.on('request:incoming', (p) => {
    const box = document.createElement('div');
    box.className = 'incoming';
    const title = document.createElement('div');
    title.innerHTML = '<strong></strong> wants to chat';
    title.querySelector('strong').textContent = `${p.nickname}, ${p.age}`;
    const bio = document.createElement('p');
    bio.className = 'small';
    bio.textContent = p.bio;
    const row = document.createElement('div');
    row.className = 'row';
    const yes = Object.assign(document.createElement('button'), { className: 'primary small', textContent: 'Accept' });
    const no = Object.assign(document.createElement('button'), { className: 'ghost small', textContent: 'Decline' });
    const respond = (accept) => {
      socket.emit('request:respond', { fromId: p.id, accept }, () => box.remove());
    };
    yes.onclick = () => respond(true);
    no.onclick = () => respond(false);
    row.append(yes, no);
    box.append(title, bio, row);
    $('#incoming').append(box);
  });

  socket.on('request:declined', () => {
    // Intentionally quiet: no rejection notice, the button just stays "Requested".
  });

  // ---------- chat ----------
  function addMsg(chatId, text, kind) {
    const c = chats.get(chatId);
    if (!c) return;
    const d = document.createElement('div');
    d.className = 'msg ' + kind;
    d.textContent = text;
    const log = $('.log', c.pane);
    log.append(d);
    log.scrollTop = log.scrollHeight;
    if (chatId !== activeChat && kind === 'theirs') c.tab.classList.add('unread');
  }

  function activate(chatId) {
    activeChat = chatId;
    for (const [id, c] of chats) {
      c.pane.hidden = id !== chatId;
      c.tab.classList.toggle('active', id === chatId);
      if (id === chatId) c.tab.classList.remove('unread');
    }
    $('#empty').hidden = chats.size > 0;
  }

  socket.on('chat:started', ({ chatId, with: other }) => {
    const pane = document.createElement('section');
    pane.className = 'pane';
    pane.innerHTML = `
      <div class="pane-head">
        <span class="who"><strong></strong> <span class="muted small"></span></span>
        <button class="ghost small leave">Leave</button>
        <button class="ghost small block">Block</button>
        <button class="ghost small report">Report</button>
      </div>
      <div class="consent">Check in before getting explicit. Either of you can leave at any time — that's a no.</div>
      <div class="log" aria-live="polite"></div>
      <form class="composer"><input maxlength="1000" placeholder="Say something…" autocomplete="off"><button class="primary">Send</button></form>`;
    $('.who strong', pane).textContent = other.nickname;
    $('.who .muted', pane).textContent = `${other.age}${other.city ? ' · ' + other.city : ''}`;
    $('.leave', pane).onclick = () => socket.emit('chat:leave', chatId);
    $('.block', pane).onclick = () => socket.emit('block', other.id);
    $('.report', pane).onclick = () => openReport(other);
    $('.composer', pane).addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('input', e.target);
      const text = input.value.trim();
      if (!text) return;
      socket.emit('message', { chatId, text }, (res) => {
        if (res.ok) {
          addMsg(chatId, res.text, 'mine');
          input.value = '';
        } else {
          addMsg(chatId, res.error || 'Not sent.', 'system');
        }
      });
    });

    const tab = document.createElement('button');
    tab.className = 'tab small';
    tab.textContent = other.nickname;
    tab.onclick = () => activate(chatId);

    $('#chat-panes').append(pane);
    $('#tabs').append(tab);
    chats.set(chatId, { with: other, pane, tab });
    addMsg(chatId, `You're now chatting with ${other.nickname}.`, 'system');
    activate(chatId);
  });

  socket.on('message', ({ chatId, text }) => addMsg(chatId, text, 'theirs'));

  socket.on('chat:ended', ({ chatId }) => {
    const c = chats.get(chatId);
    if (!c) return;
    addMsg(chatId, 'This chat has ended.', 'system');
    $('.composer', c.pane).remove();
    $('.pane-head', c.pane).querySelectorAll('button').forEach((b) => {
      if (!b.classList.contains('report')) b.remove();
    });
    const close = Object.assign(document.createElement('button'), { className: 'ghost small', textContent: 'Close' });
    close.onclick = () => {
      c.pane.remove();
      c.tab.remove();
      chats.delete(chatId);
      activate(chats.keys().next().value ?? null);
    };
    $('.pane-head', c.pane).append(close);
  });

  // ---------- safety / report ----------
  $('#safety-btn').onclick = () => $('#safety').showModal();
  $('#safety-close').onclick = () => $('#safety').close();

  function openReport(p) {
    reportTarget = p;
    $('#report-name').textContent = p.nickname;
    $('#report-dlg').showModal();
  }
  $('#report-dlg').addEventListener('close', () => {
    if ($('#report-dlg').returnValue !== 'send' || !reportTarget) return;
    const reason = new FormData($('#report-form')).get('reason');
    socket.emit('report', { targetId: reportTarget.id, reason });
    reportTarget = null;
  });

  socket.on('notice', (msg) => {
    $('#notice span').textContent = 'Message from a moderator: ' + msg;
    $('#notice').hidden = false;
  });
  $('#notice-close').onclick = () => { $('#notice').hidden = true; };

  socket.on('fatal', (msg) => {
    document.body.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'card narrow';
    d.textContent = msg;
    document.body.append(d);
  });

  socket.on('disconnect', (reason) => {
    if (me && reason !== 'io client disconnect') {
      for (const id of chats.keys()) addMsg(id, 'Connection lost. Refresh to rejoin.', 'system');
    }
  });

  // Coming back from the bank.
  const AGE_MESSAGES = {
    cancelled: 'You cancelled at your bank. You need to confirm you are 18+ to use Afterhours.',
    failed: "We couldn't confirm your age. Please try again, or choose another option.",
    expired: 'That took too long or was started in another browser. Please try again.',
  };
  function handleAgeReturn() {
  const ageResult = new URLSearchParams(location.search).get('age');
  if (ageResult) {
    history.replaceState(null, '', location.pathname);
    if (ageResult === 'verified') {
      showJoin();
      $('#join-error').textContent = '';
      $('#join .muted').insertAdjacentHTML('beforebegin', '<p class="ok">✓ Your bank confirmed you are 18+.</p>');
    } else if (ageResult === 'under18') {
      document.body.innerHTML = '<div class="card narrow"><h2>Afterhours is for adults only</h2><p>Your bank told us you are under 18, so you can\'t use this site.</p><p>If you need someone to talk to, Kids Helpline is free and confidential: <strong>1800 55 1800</strong> or <a href="https://kidshelpline.com.au">kidshelpline.com.au</a>.</p></div>';
    } else {
      showVerify(AGE_MESSAGES[ageResult] || AGE_MESSAGES.failed);
    }
    }
  }
  handleAgeReturn();
})();
