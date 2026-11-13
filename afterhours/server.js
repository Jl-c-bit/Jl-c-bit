'use strict';

const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const core = require('./lib/core');

const PORT = Number(process.env.PORT) || 3000;

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
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 8 * 1024 });

// ---- In-memory state (nothing is written to disk; restart wipes everything) ----
const users = new Map(); // id -> { id, socketId, profile, blocked:Set, reportedBy:Set, joinedAt }
const requests = new Map(); // `${from}>${to}` -> timestamp
const chats = new Map(); // chatId -> { a, b }
const bannedIps = new Map(); // ip -> expiry ms. Temporary, because IPs are shared (campuses, mobile carriers).
const BAN_MS = 24 * 60 * 60 * 1000;
const banIp = (ip) => ip && bannedIps.set(ip, Date.now() + BAN_MS);
const isBanned = (ip) => {
  const until = bannedIps.get(ip);
  if (until && until < Date.now()) bannedIps.delete(ip);
  return Boolean(until && until >= Date.now());
};

const msgLimiter = core.makeRateLimiter(20, 30_000);
const reqLimiter = core.makeRateLimiter(10, 60_000);

function ipOf(socket) {
  const fwd = socket.handshake.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : socket.handshake.address || '').trim();
}

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
}

function chatIdFor(a, b) {
  return [a, b].sort().join(':');
}

function endChatsFor(id, reason) {
  for (const [cid, c] of chats) {
    if (c.a === id || c.b === id) {
      chats.delete(cid);
      io.to(cid).emit('chat:ended', { chatId: cid, reason });
      io.in(cid).socketsLeave(cid);
    }
  }
}

function removeUser(id, { ban = false, ip = null, reason = 'left' } = {}) {
  const u = users.get(id);
  if (!u) return;
  endChatsFor(id, reason);
  for (const key of requests.keys()) if (key.startsWith(id + '>') || key.endsWith('>' + id)) requests.delete(key);
  users.delete(id);
  if (ban) banIp(ip);
  broadcastLobby();
}

io.on('connection', (socket) => {
  const ip = ipOf(socket);
  let me = null;

  if (isBanned(ip)) {
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
        banIp(ip);
        socket.emit('fatal', 'Afterhours is strictly 18+.');
        socket.disconnect(true);
      }
      return;
    }
    me = {
      id: crypto.randomUUID(),
      socketId: socket.id,
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
    chats.set(chatId, { a: me.id, b: from.id });
    socket.join(chatId);
    io.sockets.sockets.get(from.socketId)?.join(chatId);
    io.to(from.socketId).emit('chat:started', { chatId, with: publicProfile(me) });
    socket.emit('chat:started', { chatId, with: publicProfile(from) });
    ack({ ok: true });
  });

  socket.on('message', ({ chatId, text } = {}, ack = () => {}) => {
    if (!me) return ack({ ok: false });
    const c = chats.get(chatId);
    if (!c || (c.a !== me.id && c.b !== me.id)) return ack({ ok: false, error: 'Chat not found.' });
    if (!msgLimiter(me.id)) return ack({ ok: false, error: 'You are sending messages too fast.' });
    const check = core.checkMessage(text);
    if (!check.ok) {
      // One strike gets a warning (the filter is strict and can misfire); a second removes them.
      if (check.underage && ++me.strikes < 2) {
        return ack({ ok: false, error: 'Message blocked: anything suggesting someone is under 18 is not allowed. One more and you will be removed.' });
      }
      ack({ ok: false, error: check.error });
      if (check.underage) {
        removeUser(me.id, { ban: true, ip, reason: 'removed' });
        socket.emit('fatal', 'Removed: Afterhours has zero tolerance for anything involving minors.');
        socket.disconnect(true);
      }
      return;
    }
    socket.to(chatId).emit('message', { chatId, from: me.id, text: check.body, at: Date.now() });
    ack({ ok: true, text: check.body });
  });

  socket.on('chat:leave', (chatId) => {
    if (!me) return;
    const c = chats.get(chatId);
    if (!c || (c.a !== me.id && c.b !== me.id)) return;
    chats.delete(chatId);
    io.to(chatId).emit('chat:ended', { chatId, reason: 'left' });
    io.in(chatId).socketsLeave(chatId);
  });

  socket.on('block', (targetId) => {
    if (!me || !users.has(targetId)) return;
    me.blocked.add(targetId);
    const cid = chatIdFor(me.id, targetId);
    if (chats.has(cid)) {
      chats.delete(cid);
      io.to(cid).emit('chat:ended', { chatId: cid, reason: 'ended' });
      io.in(cid).socketsLeave(cid);
    }
    broadcastLobby();
  });

  socket.on('report', ({ targetId, reason } = {}, ack = () => {}) => {
    if (!me) return ack({ ok: false });
    const t = users.get(targetId);
    if (!t) return ack({ ok: true });
    t.reportedBy.add(me.id);
    me.blocked.add(t.id);
    console.warn(`[report] ${me.id} reported ${t.id} (${String(reason).slice(0, 40)})`);
    const underage = reason === 'underage';
    if (underage || t.reportedBy.size >= core.REPORTS_TO_REMOVE) {
      const tSocket = io.sockets.sockets.get(t.socketId);
      const tIp = tSocket ? ipOf(tSocket) : null;
      removeUser(t.id, { ban: true, ip: tIp, reason: 'removed' });
      tSocket?.emit('fatal', 'You were removed after reports from other members.');
      tSocket?.disconnect(true);
    } else {
      broadcastLobby();
    }
    ack({ ok: true });
  });

  socket.on('disconnect', () => {
    if (me) removeUser(me.id);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Afterhours listening on http://localhost:${PORT}`));
}

module.exports = { server, io };
