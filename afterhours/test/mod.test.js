'use strict';
process.env.MOD_PASSWORD = 'correct-horse-battery';
const test = require('node:test');
const assert = require('node:assert');
const { io: client } = require('socket.io-client');
const { server, io, ready } = require('../server');

const once = (s, ev) => new Promise((r) => s.once(ev, r));
const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));
const stateWhere = (s, pred) => new Promise((r) => {
  const h = (st) => { if (pred(st)) { s.off('state', h); r(st); } };
  s.on('state', h);
});
const profile = (over) => ({
  nickname: 'Alex', dob: '1990-01-01', gender: 'man', seeking: ['woman'],
  intents: ['hookup'], confirmAdult: true, agreeRules: true, ...over,
});

test('moderator dashboard: auth, live reports with excerpt, warn, ban, unban', async (t) => {
  await ready;
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const opts = { transports: ['websocket'], forceNew: true };
  const open = [];
  const c = (path = '', extra = {}) => { const s = client(url + path, { ...opts, ...extra }); open.push(s); return s; };
  t.after(() => { open.forEach((s) => s.close()); io.close(); server.close(); });

  // Wrong password is refused.
  const bad = c('/mod', { auth: { name: 'x', password: 'nope' } });
  assert.equal((await once(bad, 'connect_error')).message, 'unauthorized');
  bad.close();

  const mod = c('/mod', { auth: { name: 'Riley', password: 'correct-horse-battery' } });
  const first = await once(mod, 'state');
  assert.equal(first.stats.online, 0);

  const a = c(), b = c();
  await emit(a, 'join', profile());
  const aLobby = new Promise((r) => a.on('lobby', (l) => l.length && r(l)));
  await emit(b, 'join', profile({ nickname: 'Sam', gender: 'woman', seeking: ['man'] }));
  const [sam] = await aLobby;

  const inc = once(b, 'request:incoming');
  await emit(a, 'request', sam.id);
  const req = await inc;
  const started = once(a, 'chat:started');
  await emit(b, 'request:respond', { fromId: req.id, accept: true });
  const { chatId } = await started;
  await emit(a, 'message', { chatId, text: 'hi there' });
  await emit(b, 'message', { chatId, text: 'you are disgusting' });

  // Report shows up on the dashboard with the chat excerpt; users list hides raw IPs.
  const withReport = stateWhere(mod, (s) => s.reports.length === 1);
  await emit(a, 'report', { targetId: sam.id, reason: 'harassment' });
  const s1 = await withReport;
  const r = s1.reports[0];
  assert.equal(r.target.nickname, 'Sam');
  assert.equal(r.status, 'open');
  assert.deepEqual(r.excerpt.map((m) => m.text), ['hi there', 'you are disgusting']);
  assert.ok(!JSON.stringify(s1).includes('127.0.0.1') && !JSON.stringify(s1).includes('::1'), 'raw IPs never sent');

  // Warn reaches the member.
  const notice = once(b, 'notice');
  assert.equal((await emit(mod, 'warn', { userId: sam.id, text: 'Be respectful.' })).ok, true);
  assert.equal(await notice, 'Be respectful.');

  // Ban from the report removes them and resolves the report.
  const fatal = once(b, 'fatal');
  const banned = stateWhere(mod, (s) => s.bans.length === 1 && s.reports[0].status === 'resolved');
  assert.equal((await emit(mod, 'ban', { reportId: r.id, length: '7d', reason: 'Abuse' })).ok, true);
  await fatal;
  const s2 = await banned;
  assert.match(s2.reports[0].outcome, /Banned 7d by Riley/);
  assert.equal(s2.bans[0].reason, 'Abuse');
  assert.ok(s2.activity.some((x) => x.type === 'mod' && x.text.includes('Riley banned Sam')));

  // The ban holds on reconnect (same address)…
  const again = c();
  await once(again, 'fatal');

  // …until a moderator lifts it.
  const cleared = stateWhere(mod, (s) => s.bans.length === 0);
  assert.equal((await emit(mod, 'unban', { banId: s2.bans[0].id })).ok, true);
  await cleared;
  const back = c();
  assert.equal((await emit(back, 'join', profile({ nickname: 'Sam2', gender: 'woman', seeking: ['man'] }))).ok, true);
});
