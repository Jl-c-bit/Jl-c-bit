'use strict';
// Runs against a real Postgres when TEST_DATABASE_URL is set; skipped otherwise.
// It starts the actual server as a child process, restarts it, and checks
// that moderation data survived.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawn } = require('child_process');
const { io: client } = require('socket.io-client');

const DB = process.env.TEST_DATABASE_URL;
const PASS = 'db-test-password-1';
const once = (s, ev) => new Promise((r) => s.once(ev, r));
const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));
const profile = (over) => ({
  nickname: 'Alex', dob: '1990-01-01', gender: 'man', seeking: ['woman'],
  intents: ['hookup'], confirmAdult: true, agreeRules: true, consentData: true, ...over,
});

async function resetDb() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB });
  await pool.query('DROP TABLE IF EXISTS settings, bans, reports, activity');
  await pool.end();
}

const running = new Set();
function startServer(port) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, DATABASE_URL: DB, MOD_PASSWORD: PASS, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const up = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start:\n' + out)), 10000);
    child.stdout.on('data', () => { if (out.includes('Moderator dashboard:')) { clearTimeout(t); resolve(); } });
    child.on('exit', (code) => { clearTimeout(t); reject(new Error(`server exited ${code}:\n${out}`)); });
  });
  running.add(child);
  const stop = () => new Promise((r) => {
    running.delete(child);
    if (child.exitCode !== null) return r();
    child.removeAllListeners('exit');
    child.once('exit', r);
    child.kill('SIGTERM');
  });
  return { up, stop, log: () => out };
}

test('store: schema, stable IP secret, pruning', { skip: !DB && 'set TEST_DATABASE_URL' }, async () => {
  await resetDb();
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB });
  const { createStore } = require('../lib/store');

  const s1 = createStore(DB);
  const first = await s1.init();
  s1.saveBan({ id: '00000000-0000-4000-8000-000000000001', ipHash: 'aa', nickname: 'old', reason: 'r', by: 'auto', at: Date.now() - 2e6, until: Date.now() - 1e6 });
  s1.saveBan({ id: '00000000-0000-4000-8000-000000000002', ipHash: 'bb', nickname: 'perm', reason: 'r', by: 'mod', at: Date.now(), until: null });
  await s1.close();

  const s2 = createStore(DB);
  const second = await s2.init();
  assert.equal(second.secret, first.secret, 'IP hash secret is generated once and reused');
  assert.deepEqual(second.bans.map((b) => b.nickname), ['perm'], 'expired bans are pruned');
  await s2.close();
  await pool.end();
});

test('moderation data survives a server restart', { skip: !DB && 'set TEST_DATABASE_URL' }, async (t) => {
  const port = 3400 + Math.floor(Math.random() * 500);
  const url = `http://localhost:${port}`;
  const opts = { transports: ['websocket'], forceNew: true };
  const sockets = [];
  const c = (p = '', extra = {}) => { const s = client(url + p, { ...opts, ...extra }); sockets.push(s); return s; };
  t.after(() => { sockets.forEach((s) => s.close()); for (const ch of running) ch.kill('SIGKILL'); });
  await resetDb();

  // --- first run: a report, a filter event and a ban ---
  let srv = startServer(port);
  await srv.up;
  const a = c(), b = c();
  await emit(a, 'join', profile());
  const lobby = new Promise((r) => a.on('lobby', (l) => l.length && r(l)));
  await emit(b, 'join', profile({ nickname: 'Sam', gender: 'woman', seeking: ['man'] }));
  const [sam] = await lobby;
  await emit(a, 'report', { targetId: sam.id, reason: 'harassment' });
  const mod = c('/mod', { auth: { name: 'Riley', password: PASS } });
  const st = await once(mod, 'state');
  const reportId = st.reports[0].id;
  // Sam leaves before the moderator acts: the ban must still work from the report.
  const gone = new Promise((r) => mod.on('state', (s) => s.stats.online === 1 && r()));
  b.close();
  await gone;
  assert.equal((await emit(mod, 'ban', { reportId, length: '30d', reason: 'Abuse' })).ok, true);
  sockets.forEach((s) => s.close());
  await srv.stop();

  // --- second run: everything is still there ---
  srv = startServer(port);
  await srv.up;
  assert.match(srv.log(), /1 active bans, 1 reports loaded/);
  const mod2 = c('/mod', { auth: { name: 'Riley', password: PASS } });
  const st2 = await once(mod2, 'state');
  assert.equal(st2.reports[0].id, reportId);
  assert.equal(st2.reports[0].status, 'resolved');
  assert.match(st2.reports[0].outcome, /Banned 30d by Riley/);
  assert.equal(st2.bans.length, 1);
  assert.equal(st2.bans[0].reason, 'Abuse');
  assert.ok(st2.activity.some((x) => x.text.includes('Riley banned Sam')));
  assert.ok(!('targetIpHash' in st2.reports[0]), 'hashed address stays server-side');

  // The ban still applies after the restart (same machine = same address).
  await once(c(), 'fatal');
  await srv.stop();

  // Raw IPs never reach the database.
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB });
  const dump = JSON.stringify((await pool.query('SELECT * FROM bans')).rows) + JSON.stringify((await pool.query('SELECT * FROM reports')).rows);
  await pool.end();
  assert.ok(!/127\.0\.0\.1|::1|::ffff/.test(dump), 'no raw IP addresses stored');
});
