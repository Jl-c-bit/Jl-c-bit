'use strict';

// Persistence for moderation data: bans, reports and the activity log.
//
// The server keeps working copies in memory and calls these methods to write
// changes through. With DATABASE_URL set they go to Postgres and are reloaded on
// startup; without it, the memory store keeps today's behaviour (lost on restart).
//
// Member profiles and chats are never stored: only what moderation needs.

const crypto = require('crypto');

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 90;
const LOAD_REPORTS = 500;
const LOAD_ACTIVITY = 300;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bans (
  id       UUID PRIMARY KEY,
  ip_hash  TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  reason   TEXT NOT NULL DEFAULT '',
  by_whom  TEXT NOT NULL DEFAULT '',
  at       TIMESTAMPTZ NOT NULL,
  until    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS bans_ip_hash ON bans (ip_hash);
CREATE TABLE IF NOT EXISTS reports (
  id             UUID PRIMARY KEY,
  at             TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL,
  reason         TEXT NOT NULL,
  reporter       TEXT NOT NULL,
  target         JSONB NOT NULL,
  target_reports INT NOT NULL DEFAULT 1,
  excerpt        JSONB NOT NULL DEFAULT '[]',
  outcome        TEXT,
  resolved_at    TIMESTAMPTZ,
  target_ip_hash TEXT
);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_ip_hash TEXT;
CREATE INDEX IF NOT EXISTS reports_at ON reports (at DESC);
CREATE TABLE IF NOT EXISTS activity (
  id   UUID PRIMARY KEY,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_at ON activity (at DESC);
`;

const ts = (ms) => (ms == null ? null : new Date(ms));
const ms = (d) => (d == null ? null : new Date(d).getTime());

function memoryStore() {
  return {
    kind: 'memory',
    async init() {
      return {
        secret: process.env.IP_HASH_SECRET || crypto.randomBytes(32).toString('hex'),
        bans: [],
        reports: [],
        activity: [],
      };
    },
    saveBan() {},
    deleteBan() {},
    saveReport() {},
    saveActivity() {},
    async prune() {},
    async flush() {},
    async close() {},
  };
}

function postgresStore(connectionString) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString, max: 5 });
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));

  // Writes run one after another so they land in the order they happened,
  // and never block or crash the live site if the database hiccups.
  let queue = Promise.resolve();
  const write = (label, sql, params) => {
    queue = queue
      .then(() => pool.query(sql, params))
      .catch((err) => console.error(`[db] ${label} failed:`, err.message));
    return queue;
  };

  return {
    kind: 'postgres',

    async init() {
      await pool.query(SCHEMA);

      // Secret used to hash IP addresses. Env var wins; otherwise one is generated once and kept.
      let secret = process.env.IP_HASH_SECRET;
      if (!secret) {
        await pool.query(
          `INSERT INTO settings (key, value) VALUES ('ip_hash_secret', $1) ON CONFLICT (key) DO NOTHING`,
          [crypto.randomBytes(32).toString('hex')]
        );
        secret = (await pool.query(`SELECT value FROM settings WHERE key = 'ip_hash_secret'`)).rows[0].value;
      }

      await this.prune();
      const [bans, reports, activity] = await Promise.all([
        pool.query(`SELECT * FROM bans WHERE until IS NULL OR until > now()`),
        pool.query(`SELECT * FROM reports ORDER BY at DESC LIMIT ${LOAD_REPORTS}`),
        pool.query(`SELECT * FROM activity ORDER BY at DESC LIMIT ${LOAD_ACTIVITY}`),
      ]);
      return {
        secret,
        bans: bans.rows.map((r) => ({
          id: r.id, ipHash: r.ip_hash, nickname: r.nickname, reason: r.reason, by: r.by_whom, at: ms(r.at), until: ms(r.until),
        })),
        reports: reports.rows.map((r) => ({
          id: r.id, at: ms(r.at), status: r.status, reason: r.reason, reporter: r.reporter, target: r.target,
          targetReports: r.target_reports, excerpt: r.excerpt, outcome: r.outcome, targetIpHash: r.target_ip_hash,
        })),
        activity: activity.rows.map((r) => ({ id: r.id, type: r.type, text: r.text, at: ms(r.at) })),
      };
    },

    saveBan(b) {
      return write('save ban',
        `INSERT INTO bans (id, ip_hash, nickname, reason, by_whom, at, until) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET reason = EXCLUDED.reason, by_whom = EXCLUDED.by_whom, until = EXCLUDED.until`,
        [b.id, b.ipHash, b.nickname || '', b.reason || '', b.by || '', ts(b.at), ts(b.until)]);
    },

    deleteBan(id) {
      return write('delete ban', `DELETE FROM bans WHERE id = $1`, [id]);
    },

    saveReport(r) {
      return write('save report',
        `INSERT INTO reports (id, at, status, reason, reporter, target, target_reports, excerpt, outcome, target_ip_hash, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $3::text = 'resolved' THEN now() END)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, outcome = EXCLUDED.outcome,
           resolved_at = CASE WHEN EXCLUDED.status = 'resolved' THEN COALESCE(reports.resolved_at, now()) END`,
        [r.id, ts(r.at), r.status, r.reason, r.reporter, JSON.stringify(r.target), r.targetReports,
          JSON.stringify(r.excerpt || []), r.outcome, r.targetIpHash || null]);
    },

    saveActivity(a) {
      return write('save activity', `INSERT INTO activity (id, type, text, at) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
        [a.id, a.type, a.text, ts(a.at)]);
    },

    // Data minimisation: expired bans go immediately; closed reports (with their
    // chat excerpts) and the activity log are kept for RETENTION_DAYS.
    async prune() {
      const days = `${RETENTION_DAYS} days`;
      await pool.query(`DELETE FROM bans WHERE until IS NOT NULL AND until < now()`);
      await pool.query(`DELETE FROM reports WHERE status = 'resolved' AND COALESCE(resolved_at, at) < now() - $1::interval`, [days]);
      await pool.query(`DELETE FROM activity WHERE at < now() - $1::interval`, [days]);
    },

    flush() {
      return queue;
    },

    async close() {
      await queue;
      await pool.end();
    },
  };
}

function createStore(url = process.env.DATABASE_URL) {
  return url ? postgresStore(url) : memoryStore();
}

module.exports = { createStore, RETENTION_DAYS };
