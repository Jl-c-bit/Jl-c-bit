'use strict';

const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const core = require('./lib/core');

const PORT = Number(process.env.PORT) || 3000;
// The moderator dashboard is disabled unless a strong password is configured.
const MOD_PASSWORD = process.env.MOD_PASSWORD || '';
const MOD_ENABLED = MOD_PASSWORD.length >= 12;
// Set TRUST_PROXY=1 when running behind a host's load balancer (Render, Railway, Fly).
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy':
      "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'; script-src 'self'",
  });
  next();
});
app.use('/mod', (req, res, next) => {
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 8 * 1024 });
const mods = io.of('/mod');

// ---- In-memory state (nothing is written to disk; restart wipes everything) ----
const users = new Map(); // id -> { id, socketId, ip, profile, blocked:Set, reportedBy:Set, strikes, joinedAt }
const requests = new Map(); // `${from}>${to}` -> timestamp
const chats = new Map(); // chatId -> { a, b, log: [{ from, text, at }] }
const endedLogs = new Map(); // chatId -> { log, endedAt } kept briefly so a report after leaving still has context
const reports = []; // newest first
const bans = new Map(); // banId -> { id, ip, nickname, reason, by, at, until }
const activity = []; // newest first, moderation-relevant events only

const CHAT_LOG_KEEP = 20; // messages kept per chat; only ever shown to moderators when someone reports
const ENDED_LOG_MS = 30 * 60 * 1000;
const MAX_REPORTS = 500;
const MAX_ACTIVITY = 300;
const AUTO_BAN_MS = 24 * 60 * 60 * 1000;
const BAN_LENGTHS = { '24h': 24 * 3600e3, '7d': 7 * 24 * 3600e3, '30d': 30 * 24 * 3600e3, permanent: 0 };

const msgLimiter = core.makeRateLimiter(20, 30_000);
const reqLimiter = core.makeRateLimiter(10, 60_000);

function ipOf(socket) {
  const fwd = socket.handshake.headers['x-forwarded-for'];
  if (TRUST_PROXY && fwd) {
    // The last entry is the one the host's proxy added; earlier ones can be forged by the client.
    const parts = String(fwd).split(',');
    return parts[parts.length - 1].trim();
  }
  return socket.handshake.address || '';
}

// Moderators see a short fingerprint, never the raw IP.
function ipTag(ip) {
  return ip ? crypto.createHash('sha256').update('afterhours:' + ip).digest('hex').slice(0, 8) : '—';
}

function log(type, text) {
  activity.unshift({ id: crypto.randomUUID(), type, text, at: Date.now() });
  activity.length = Math.min(activity.length, MAX_ACTIVITY);
  pushModState();
}

// ---- bans ----
function pruneBans() {
  const now = Date.now();
  for (const b of bans.values()) if (b.until && b.until < now) bans.delete(b.id);
}

function activeBanFor(ip) {
  pruneBans();
  for (const b of bans.values()) if (b.ip === ip) return b;
  return null;
}

function addBan(ip, { nickname = '', reason, by, ms = AUTO_BAN_MS }) {
  if (!ip) return null;
  const existing = activeBanFor(ip);
  if (existing) bans.delete(existing.id);
  const b = { id: crypto.randomUUID(), ip, nickname, reason, by, at: Date.now(), until: ms ? Date.now() + ms : null };
  bans.set(b.id, b);
  return b;
}

// ---- lobby ----
function publicProfile(u) {
  const { nickname, age, gender, intents, city, bio } = u.profile;
  return { id: u.id, nickname, age, gender, intents, city, bio };
}

function visibleTo(viewer, other) {
  return (
    viewer.id !== other.id &&
    !viewer.blocked.has(other.id) &&
    !other.blocked.has(viewer.id) &&
    core.compatible(viewer.profile, other.profile)
  );
}

function sendLobby(u) {
  const list = [...users.values()].filter((o) => visibleTo(u, o)).map(publicProfile);
  io.to(u.socketId).emit('lobby', list);
}

function broadcastLobby() {
  for (const u of users.values()) sendLobby(u);
  pushModState();
}

// ---- chats ----
function chatIdFor(a, b) {
  return [a, b].sort().join(':');
}

function closeChat(cid, reason) {
  const c = chats.get(cid);
  if (!c) return;
  chats.delete(cid);
  if (c.log.length) endedLogs.set(cid, { log: c.log, endedAt: Date.now() });
  io.to(cid).emit('chat:ended', { chatId: cid, reason });
  io.in(cid).socketsLeave(cid);
}

function endChatsFor(id, reason) {
  for (const [cid, c] of chats) if (c.a === id || c.b === id) closeChat(cid, reason);
}

function chatLogBetween(a, b) {
  const cid = chatIdFor(a, b);
  return chats.get(cid)?.log || endedLogs.get(cid)?.log || [];
}

setInterval(() => {
  const cutoff = Date.now() - ENDED_LOG_MS;
  for (const [cid, e] of endedLogs) if (e.endedAt < cutoff) endedLogs.delete(cid);
}, 60_000).unref();

// ---- removing people ----
function removeUser(id, { reason = 'left' } = {}) {
  const u = users.get(id);
  if (!u) return;
  endChatsFor(id, reason);
  for (const key of requests.keys()) if (key.startsWith(id + '>') || key.endsWith('>' + id)) requests.delete(key);
  users.delete(id);
  broadcastLobby();
}

// Removes a user and disconnects them with a message. Optionally bans their IP.
function expel(u, { message, ban = null }) {
  if (ban) addBan(u.ip, { nickname: u.profile.nickname, ...ban });
  const s = io.sockets.sockets.get(u.socketId);
  removeUser(u.id, { reason: 'removed' });
  s?.emit('fatal', message);
  s?.disconnect(true);
}

// ---- moderator state ----
function modSnapshot() {
  pruneBans();
  return {
    at: Date.now(),
    stats: {
      online: users.size,
      chats: chats.size,
      openReports: reports.filter((r) => r.status === 'open').length,
      bans: bans.size,
    },
    users: [...users.values()].map((u) => ({
      ...publicProfile(u),
      ipTag: ipTag(u.ip),
      joinedAt: u.joinedAt,
      reports: u.reportedBy.size,
      strikes: u.strikes,
      chats: [...chats.values()].filter((c) => c.a === u.id || c.b === u.id).length,
    })),
    reports: reports.slice(0, 200),
    bans: [...bans.values()].map(({ ip, ...b }) => ({ ...b, ipTag: ipTag(ip) })),
    activity: activity.slice(0, 150),
  };
}

let pushTimer = null;
function pushModState() {
  if (!MOD_ENABLED || pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (mods.sockets.size) mods.emit('state', modSnapshot());
  }, 200);
}

// ---- member connections ----
io.on('connection', (socket) => {
  const ip = ipOf(socket);
  let me = null;

  if (activeBanFor(ip)) {
    socket.emit('fatal', 'You have been removed from Afterhours.');
    socket.disconnect(true);
    return;
  }

  socket.on('join', (input, ack = () => {}) => {
    if (me) return ack({ ok: false, error: 'Already joined.' });
    const result = core.validateProfile(input);
    if (!result.ok) {
      ack({ ok: false, error: result.error });
      if (result.underage) {
        addBan(ip, { nickname: String(input?.nickname || '').slice(0, 24), reason: 'Under-18 details at sign-up', by: 'auto' });
        log('auto', `Refused sign-up with under-18 details (${ipTag(ip)}). Banned 24h.`);
        socket.emit('fatal', 'Afterhours is strictly 18+.');
        socket.disconnect(true);
      }
      return;
    }
    me = {
      id: crypto.randomUUID(),
      socketId: socket.id,
      ip,
      profile: result.profile,
      blocked: new Set(),
      reportedBy: new Set(),
      strikes: 0,
      joinedAt: Date.now(),
    };
    users.set(me.id, me);
    ack({ ok: true, me: publicProfile(me) });
    broadcastLobby();
  });

  socket.on('request', (targetId, ack = () => {}) => {
    if (!me) return ack({ ok: false });
    const t = users.get(targetId);
    if (!t || !visibleTo(me, t)) return ack({ ok: false, error: 'That person is no longer available.' });
    if (!reqLimiter(me.id)) return ack({ ok: false, error: 'Slow down a little.' });
    if (chats.has(chatIdFor(me.id, t.id))) return ack({ ok: false, error: 'You are already chatting.' });
    requests.set(`${me.id}>${t.id}`, Date.now());
    io.to(t.socketId).emit('request:incoming', publicProfile(me));
    ack({ ok: true });
  });

  socket.on('request:respond', ({ fromId, accept } = {}, ack = () => {}) => {
    if (!me) return ack({ ok: false });
    const key = `${fromId}>${me.id}`;
    if (!requests.has(key)) return ack({ ok: false, error: 'Request expired.' });
    requests.delete(key);
    const from = users.get(fromId);
    if (!from) return ack({ ok: false, error: 'They left.' });
    if (!accept) {
      io.to(from.socketId).emit('request:declined', { id: me.id });
      return ack({ ok: true });
    }
    const chatId = chatIdFor(me.id, from.id);
    chats.set(chatId, { a: me.id, b: from.id, log: [] });
    endedLogs.delete(chatId);
    socket.join(chatId);
    io.sockets.sockets.get(from.socketId)?.join(chatId);
    io.to(from.socketId).emit('chat:started', { chatId, with: publicProfile(me) });
    socket.emit('chat:started', { chatId, with: publicProfile(from) });
    ack({ ok: true });
    pushModState();
  });

  socket.on('message', ({ chatId, text } = {}, ack = () => {}) => {
    if (!me) return ack({ ok: false });
    const c = chats.get(chatId);
    if (!c || (c.a !== me.id && c.b !== me.id)) return ack({ ok: false, error: 'Chat not found.' });
    if (!msgLimiter(me.id)) return ack({ ok: false, error: 'You are sending messages too fast.' });
    const check = core.checkMessage(text);
    if (!check.ok) {
      const snippet = String(text).slice(0, 120);
      // One strike gets a warning (the filter is strict and can misfire); a second removes them.
      if (check.underage && ++me.strikes < 2) {
        log('filter', `${me.profile.nickname}: minor-related message blocked (strike 1) — "${snippet}"`);
        return ack({ ok: false, error: 'Message blocked: anything suggesting someone is under 18 is not allowed. One more and you will be removed.' });
      }
      ack({ ok: false, error: check.error });
      if (check.underage) {
        log('auto', `${me.profile.nickname} removed and banned 24h: second minor-related message — "${snippet}"`);
        expel(me, {
          message: 'Removed: Afterhours has zero tolerance for anything involving minors.',
          ban: { reason: 'Minor-related messages (auto)', by: 'auto' },
        });
      } else {
        log('filter', `${me.profile.nickname}: selling/solicitation message blocked — "${snippet}"`);
      }
      return;
    }
    c.log.push({ from: me.profile.nickname, text: check.body, at: Date.now() });
    if (c.log.length > CHAT_LOG_KEEP) c.log.shift();
    socket.to(chatId).emit('message', { chatId, from: me.id, text: check.body, at: Date.now() });
    ack({ ok: true, text: check.body });
  });

  socket.on('chat:leave', (chatId) => {
    if (!me) return;
    const c = chats.get(chatId);
    if (!c || (c.a !== me.id && c.b !== me.id)) return;
    closeChat(chatId, 'left');
    pushModState();
  });

  socket.on('block', (targetId) => {
    if (!me || !users.has(targetId)) return;
    me.blocked.add(targetId);
    closeChat(chatIdFor(me.id, targetId), 'ended');
    broadcastLobby();
  });

  socket.on('report', ({ targetId, reason } = {}, ack = () => {}) => {
    if (!me) return ack({ ok: false });
    const t = users.get(targetId);
    if (!t) return ack({ ok: true });
    const why = ['underage', 'harassment', 'selling', 'other'].includes(reason) ? reason : 'other';
    t.reportedBy.add(me.id);
    me.blocked.add(t.id);

    const report = {
      id: crypto.randomUUID(),
      at: Date.now(),
      status: 'open',
      reason: why,
      reporter: me.profile.nickname,
      target: { ...publicProfile(t), ipTag: ipTag(t.ip) },
      targetReports: t.reportedBy.size,
      excerpt: chatLogBetween(me.id, t.id).slice(),
      outcome: null,
    };
    reports.unshift(report);
    reports.length = Math.min(reports.length, MAX_REPORTS);

    // Auto-action stays on so the site is protected when no moderator is online;
    // moderators review it afterwards and can lift the ban from the dashboard.
    if (why === 'underage' || t.reportedBy.size >= core.REPORTS_TO_REMOVE) {
      const auto = why === 'underage' ? 'reported as possibly under 18' : `${t.reportedBy.size} reports`;
      report.outcome = `Auto-removed and banned 24h (${auto}) — please review`;
      log('auto', `${t.profile.nickname} removed and banned 24h: ${auto}.`);
      expel(t, {
        message: 'You were removed after reports from other members.',
        ban: { reason: `Reports: ${auto}`, by: 'auto' },
      });
    } else {
      log('report', `${me.profile.nickname} reported ${t.profile.nickname} (${why}).`);
      broadcastLobby();
    }
    ack({ ok: true });
  });

  socket.on('disconnect', () => {
    if (me) removeUser(me.id);
  });
});

// ---- moderator connections ----
function passwordOk(given) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(MOD_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

const failedLogins = new Map(); // ip -> [timestamps]
function tooManyFailures(ip) {
  const recent = (failedLogins.get(ip) || []).filter((t) => Date.now() - t < 15 * 60_000);
  failedLogins.set(ip, recent);
  return recent.length >= 5;
}

mods.use((socket, next) => {
  if (!MOD_ENABLED) return next(new Error('disabled'));
  const ip = ipOf(socket);
  if (tooManyFailures(ip)) return next(new Error('locked'));
  if (!passwordOk(socket.handshake.auth?.password)) {
    failedLogins.get(ip).push(Date.now());
    return next(new Error('unauthorized'));
  }
  next();
});

function findReport(id) {
  return reports.find((r) => r.id === id);
}

mods.on('connection', (socket) => {
  const modName = String(socket.handshake.auth?.name || '').replace(/[^\w .-]/g, '').trim().slice(0, 24) || 'moderator';
  log('mod', `${modName} signed in to the dashboard.`);
  socket.emit('state', modSnapshot());
  socket.on('disconnect', () => log('mod', `${modName} left the dashboard.`));

  socket.on('kick', ({ userId } = {}, ack = () => {}) => {
    const u = users.get(userId);
    if (!u) return ack({ ok: false, error: 'User is no longer online.' });
    log('mod', `${modName} kicked ${u.profile.nickname}.`);
    expel(u, { message: 'A moderator removed you from this session. Please read the community rules before rejoining.' });
    ack({ ok: true });
  });

  socket.on('ban', ({ userId, reportId, length = '24h', reason = '' } = {}, ack = () => {}) => {
    const ms = BAN_LENGTHS[length];
    if (ms === undefined) return ack({ ok: false, error: 'Unknown ban length.' });
    const report = reportId ? findReport(reportId) : null;
    const u = users.get(userId || report?.target.id);
    const why = String(reason).trim().slice(0, 120) || (report ? `Report: ${report.reason}` : 'Moderator decision');
    if (u) {
      log('mod', `${modName} banned ${u.profile.nickname} (${length}): ${why}`);
      expel(u, { message: 'You have been banned from Afterhours by a moderator.', ban: { reason: why, by: modName, ms } });
    } else if (report) {
      // They've gone (left, or were auto-removed). If an auto-ban holds their address, replace it.
      pruneBans();
      const existing = [...bans.values()].find((b) => ipTag(b.ip) === report.target.ipTag);
      if (!existing) return ack({ ok: false, error: 'They are offline and their address is no longer held, so they cannot be banned now.' });
      addBan(existing.ip, { nickname: report.target.nickname, reason: why, by: modName, ms });
      log('mod', `${modName} changed ${report.target.nickname}'s ban to ${length}: ${why}`);
    } else {
      return ack({ ok: false, error: 'User is no longer online.' });
    }
    if (report) {
      report.status = 'resolved';
      report.outcome = `Banned ${length} by ${modName}`;
    }
    pushModState();
    ack({ ok: true });
  });

  socket.on('unban', ({ banId } = {}, ack = () => {}) => {
    const b = bans.get(banId);
    if (!b) return ack({ ok: false, error: 'Ban not found.' });
    bans.delete(banId);
    log('mod', `${modName} lifted the ban on ${b.nickname || ipTag(b.ip)}.`);
    ack({ ok: true });
  });

  socket.on('warn', ({ userId, text } = {}, ack = () => {}) => {
    const u = users.get(userId);
    if (!u) return ack({ ok: false, error: 'User is no longer online.' });
    const msg = String(text || '').trim().slice(0, 300) || 'Please follow the community rules.';
    io.to(u.socketId).emit('notice', msg);
    log('mod', `${modName} warned ${u.profile.nickname}: "${msg}"`);
    ack({ ok: true });
  });

  socket.on('resolve', ({ reportId, outcome = 'Dismissed' } = {}, ack = () => {}) => {
    const r = findReport(reportId);
    if (!r) return ack({ ok: false, error: 'Report not found.' });
    const what = String(outcome).trim().slice(0, 60) || 'Dismissed';
    r.status = 'resolved';
    r.outcome = `${what} by ${modName}`;
    log('mod', `${modName} closed the report on ${r.target.nickname}: ${what}.`);
    ack({ ok: true });
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Afterhours listening on http://localhost:${PORT}`);
    console.log(
      MOD_ENABLED
        ? `Moderator dashboard: http://localhost:${PORT}/mod/`
        : 'Moderator dashboard disabled: set MOD_PASSWORD (12+ characters) to enable it.'
    );
  });
}

module.exports = { server, io };
