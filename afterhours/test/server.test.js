'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { io: client } = require('socket.io-client');
const { server, io, ready } = require('../server');

const once = (s, ev) => new Promise((r) => s.once(ev, r));
const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));
// Resolve with the next lobby event whose list satisfies pred.
const lobbyWhere = (s, pred) => new Promise((r) => {
  const h = (l) => { if (pred(l)) { s.off('lobby', h); r(l); } };
  s.on('lobby', h);
});
const profile = (over) => ({
  nickname: 'Alex', dob: '1990-01-01', gender: 'man', seeking: ['woman'],
  intents: ['hookup'], confirmAdult: true, agreeRules: true, ...over,
});

test('end-to-end: match, consent to chat, message, safety filters', async (t) => {
  await ready;
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const opts = { transports: ['websocket'], forceNew: true };
  const a = client(url, opts), b = client(url, opts), kid = client(url, opts);
  t.after(() => { a.close(); b.close(); kid.close(); io.close(); server.close(); });

  const aSeesB = lobbyWhere(a, (l) => l.length === 1);
  assert.equal((await emit(a, 'join', profile())).ok, true);
  const jb = await emit(b, 'join', profile({ nickname: 'Sam', gender: 'woman', seeking: ['man'] }));
  assert.equal(jb.ok, true);
  const [bCard] = await aSeesB;
  assert.equal(bCard.nickname, 'Sam');
  assert.ok(!('dob' in bCard) && !('seeking' in bCard), 'private fields never leave the server');

  // Cannot message before the other side accepts.
  assert.equal((await emit(a, 'message', { chatId: 'x', text: 'hi' })).ok, false);

  const incoming = once(b, 'request:incoming');
  assert.equal((await emit(a, 'request', bCard.id)).ok, true);
  const req = await incoming;
  const aStarted = once(a, 'chat:started');
  assert.equal((await emit(b, 'request:respond', { fromId: req.id, accept: true })).ok, true);
  const { chatId } = await aStarted;

  const got = once(b, 'message');
  assert.equal((await emit(a, 'message', { chatId, text: 'hey, drink first?' })).ok, true);
  assert.equal((await got).text, 'hey, drink first?');

  const sell = await emit(a, 'message', { chatId, text: '$100 per hour' });
  assert.equal(sell.ok, false);

  // First minor-related message: warning. Second: removal.
  const w = await emit(b, 'message', { chatId, text: 'im 16' });
  assert.equal(w.ok, false);
  assert.match(w.error, /One more/);
  const ended = once(a, 'chat:ended');
  const bFatal = once(b, 'fatal');
  await emit(b, 'message', { chatId, text: 'im 16' });
  await bFatal;
  await ended;

  // Under-18 date of birth is refused and disconnected.
  const kidFatal = once(kid, 'fatal');
  const kr = await emit(kid, 'join', profile({ dob: '2012-01-01' }));
  assert.equal(kr.ok, false);
  await kidFatal;
});
