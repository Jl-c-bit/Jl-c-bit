'use strict';

// Bank-backed 18+ checks via ConnectID (Australian Payments Plus).
//
// Flow: the person picks their bank → we send a Pushed Authorisation Request
// asking for ONE claim, `over18` → they approve at their bank → the bank sends
// them back to /verify/callback → we read over18 from the verified ID token →
// we give the browser a signed "age-verified" pass (a cookie) for a few hours.
//
// We never ask for or receive name, date of birth, address or any identifier
// we keep. Nothing from the bank is stored.
//
// AGE_VERIFICATION selects the provider:
//   none      – (default) self-declared date of birth only
//   connectid – real ConnectID. Needs @connectid-tools/rp-nodejs-sdk installed and
//               CONNECTID_* settings; only approved ConnectID participants may use the SDK.
//   mock      – a pretend bank for local development and tests. Refused in production.

const crypto = require('crypto');
const fs = require('fs');

const PASS_COOKIE = 'ah_age';
const STATE_COOKIE = 'ah_age_state';
const PASS_HOURS = Number(process.env.AGE_PASS_HOURS) || 12;
const PENDING_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------- cookies
function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieString(name, value, { maxAgeSec, secure }) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax', // must survive the top-level redirect back from the bank
    secure ? 'Secure' : null,
    maxAgeSec != null ? `Max-Age=${maxAgeSec}` : null,
  ].filter(Boolean).join('; ');
}

// A pass is base64url(JSON) + "." + HMAC. It says only "this browser proved 18+ until <exp>".
function makePassSigner(getSecret) {
  const key = () => crypto.createHmac('sha256', getSecret()).update('afterhours-age-pass').digest();
  const sign = (body) => crypto.createHmac('sha256', key()).update(body).digest('base64url');
  return {
    issue(now = Date.now()) {
      const body = Buffer.from(JSON.stringify({ v: 1, over18: true, exp: now + PASS_HOURS * 3600e3 })).toString('base64url');
      return `${body}.${sign(body)}`;
    },
    check(token, now = Date.now()) {
      const [body, sig] = String(token || '').split('.');
      if (!body || !sig) return false;
      const expected = Buffer.from(sign(body));
      const given = Buffer.from(sig);
      if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
      try {
        const p = JSON.parse(Buffer.from(body, 'base64url').toString());
        return p.v === 1 && p.over18 === true && typeof p.exp === 'number' && p.exp > now;
      } catch {
        return false;
      }
    },
  };
}

// ---------------------------------------------------------------- providers
// Each provider exposes the same four calls as the ConnectID SDK uses, so the
// routes don't care which one is active.

function connectIdProvider(env) {
  // Certificates and keys can be given as a file path (CONNECTID_X_FILE) or as the
  // PEM text itself (CONNECTID_X, handy for host "secret" settings). Text is written
  // to a private temp file so the SDK always gets a path.
  const os = require('os');
  const path = require('path');
  let dir = null;
  const pemPath = (name) => {
    if (env[name + '_FILE']) return env[name + '_FILE'];
    if (!env[name]) return null;
    dir ||= fs.mkdtempSync(path.join(os.tmpdir(), 'connectid-'));
    const file = path.join(dir, name.toLowerCase() + '.pem');
    fs.writeFileSync(file, env[name].replace(/\\n/g, '\n'), { mode: 0o600 });
    return file;
  };

  const required = ['CONNECTID_CLIENT_ID', 'CONNECTID_SIGNING_KID', 'CONNECTID_REDIRECT_URI', 'CONNECTID_REGISTRY_URI'];
  const missing = required.filter((k) => !env[k]);
  const pems = ['CONNECTID_SIGNING_KEY', 'CONNECTID_SIGNING_PEM', 'CONNECTID_TRANSPORT_KEY', 'CONNECTID_TRANSPORT_PEM', 'CONNECTID_CA_PEM'];
  for (const k of pems) if (!env[k] && !env[k + '_FILE']) missing.push(k);
  if (missing.length) throw new Error(`ConnectID is missing settings: ${missing.join(', ')}`);

  const config = {
    client_id: env.CONNECTID_CLIENT_ID,
    signing_kid: env.CONNECTID_SIGNING_KID,
    signing_key: pemPath('CONNECTID_SIGNING_KEY'),
    signing_pem: pemPath('CONNECTID_SIGNING_PEM'),
    transport_key: pemPath('CONNECTID_TRANSPORT_KEY'),
    transport_pem: pemPath('CONNECTID_TRANSPORT_PEM'),
    ca_pem: pemPath('CONNECTID_CA_PEM'),
    registry_participants_uri: env.CONNECTID_REGISTRY_URI,
    application_redirect_uri: env.CONNECTID_REDIRECT_URI,
    purpose: 'confirming you are 18 or older',
    required_claims: ['over18'],
    include_uncertified_participants: env.CONNECTID_INCLUDE_UNCERTIFIED === '1', // sandbox only
    log_level: env.CONNECTID_LOG_LEVEL || 'info',
  };

  let clientPromise = null;
  const client = () => {
    clientPromise ||= import('@connectid-tools/rp-nodejs-sdk')
      .then((m) => new (m.default || m)(config))
      .catch((err) => {
        clientPromise = null;
        if (err.code === 'ERR_MODULE_NOT_FOUND') {
          throw new Error('AGE_VERIFICATION=connectid needs the ConnectID SDK: run `npm install @connectid-tools/rp-nodejs-sdk` (approved ConnectID participants only).');
        }
        throw err;
      });
    return clientPromise;
  };

  return {
    name: 'connectid',
    async check() {
      await client();
    },
    async banks() {
      const c = await client();
      const [main, fallback] = await Promise.all([c.getParticipants(), c.getFallbackProviderParticipants().catch(() => [])]);
      const list = (orgs, isFallback) =>
        orgs.flatMap((org) => (org.AuthorisationServers || []).map((as) => ({
          id: as.AuthorisationServerId,
          name: as.CustomerFriendlyName,
          logo: as.CustomerFriendlyLogoUri,
          fallback: isFallback,
        })));
      return [...list(main, false), ...list(fallback, true)];
    },
    async start(authServerId) {
      const c = await client();
      const r = await c.sendPushedAuthorisationRequest(authServerId, ['over18'], [], 'confirming you are 18 or older');
      return { authUrl: r.authUrl, codeVerifier: r.codeVerifier, state: r.state, nonce: r.nonce };
    },
    async finish(pending, query) {
      const c = await client();
      const tokens = await c.retrieveTokens(pending.authServerId, query, pending.codeVerifier, pending.state, pending.nonce);
      const claims = tokens.consolidatedClaims();
      return { over18: claims.over18 === true };
    },
  };
}

// A pretend bank: same flow, no real identity check. For development and tests only.
function mockProvider(env) {
  if (env.NODE_ENV === 'production' && env.AGE_VERIFICATION_ALLOW_MOCK !== '1') {
    throw new Error('AGE_VERIFICATION=mock is a fake bank and cannot be used in production.');
  }
  const codes = new Map(); // code -> { state, over18 }
  return {
    name: 'mock',
    async check() {},
    async banks() {
      return [
        { id: 'mock-bank', name: 'Pretend Bank (testing only)', logo: '', fallback: false },
        { id: 'mock-docs', name: 'Verify with ID documents (testing only)', logo: '', fallback: true },
      ];
    },
    async start(authServerId) {
      const state = crypto.randomBytes(16).toString('base64url');
      return {
        authUrl: `/verify/mock-bank?as=${encodeURIComponent(authServerId)}&state=${state}`,
        codeVerifier: crypto.randomBytes(16).toString('base64url'),
        state,
        nonce: crypto.randomBytes(16).toString('base64url'),
      };
    },
    approve(state, over18) {
      const code = crypto.randomBytes(12).toString('base64url');
      codes.set(code, { state, over18 });
      return code;
    },
    async finish(pending, query) {
      const c = codes.get(query.code);
      codes.delete(query.code);
      if (!c || c.state !== pending.state) throw new Error('invalid authorisation code');
      return { over18: c.over18 };
    },
  };
}

function createProvider(env = process.env) {
  const kind = (env.AGE_VERIFICATION || 'none').toLowerCase();
  if (kind === 'none') return null;
  if (kind === 'connectid') return connectIdProvider(env);
  if (kind === 'mock') return mockProvider(env);
  throw new Error(`Unknown AGE_VERIFICATION "${kind}" (use none, connectid or mock).`);
}

// ---------------------------------------------------------------- routes
function mountAgeVerification(app, { provider, getSecret, secureCookies, onEvent = () => {} }) {
  const passes = makePassSigner(getSecret);
  const pending = new Map(); // state -> { authServerId, codeVerifier, state, nonce, at }
  const startLimiter = new Map(); // ip -> [timestamps]

  const prune = () => {
    const cutoff = Date.now() - PENDING_MS;
    for (const [k, v] of pending) if (v.at < cutoff) pending.delete(k);
  };
  setInterval(prune, 60_000).unref();

  const isVerified = (cookieHeader) => !provider || passes.check(parseCookies(cookieHeader)[PASS_COOKIE]);

  app.get('/verify/status', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ required: Boolean(provider), provider: provider?.name || 'none', verified: isVerified(req.headers.cookie) });
  });

  if (!provider) return { isVerified };

  app.get('/verify/banks', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json({ banks: await provider.banks() });
    } catch (err) {
      console.error('[age] could not list banks:', err.message);
      res.status(503).json({ error: 'Age verification is temporarily unavailable. Please try again shortly.' });
    }
  });

  app.post('/verify/start', require('express').json({ limit: '1kb' }), async (req, res) => {
    // JSON-only, so a form on another site can't start a flow on someone's behalf.
    if (!req.is('application/json')) return res.status(415).json({ error: 'Unsupported request.' });
    const ip = req.ip || '';
    const recent = (startLimiter.get(ip) || []).filter((t) => Date.now() - t < 10 * 60_000);
    if (recent.length >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    recent.push(Date.now());
    startLimiter.set(ip, recent);

    const authServerId = String(req.body?.bankId || '');
    try {
      const banks = await provider.banks();
      if (!banks.some((b) => b.id === authServerId)) return res.status(400).json({ error: 'Choose a bank from the list.' });
      prune();
      const r = await provider.start(authServerId);
      pending.set(r.state, { authServerId, codeVerifier: r.codeVerifier, state: r.state, nonce: r.nonce, at: Date.now() });
      // Ties the bank's reply to this browser: a callback with someone else's state is rejected.
      res.set('Set-Cookie', cookieString(STATE_COOKIE, r.state, { maxAgeSec: PENDING_MS / 1000, secure: secureCookies }));
      res.json({ authUrl: r.authUrl });
    } catch (err) {
      console.error('[age] could not start verification:', err.message);
      res.status(503).json({ error: 'Your bank could not be reached. Please try again or choose another option.' });
    }
  });

  const finishPage = (res, outcome) => res.redirect(303, `/?age=${outcome}`);

  app.get('/verify/callback', async (req, res) => {
    const clearState = cookieString(STATE_COOKIE, '', { maxAgeSec: 0, secure: secureCookies });
    const query = {
      code: req.query.code, state: req.query.state, iss: req.query.iss,
      error: req.query.error, error_description: req.query.error_description,
    };
    const state = String(query.state || '');
    const p = pending.get(state);
    pending.delete(state);
    res.set('Set-Cookie', clearState);

    if (!p || parseCookies(req.headers.cookie)[STATE_COOKIE] !== state) return finishPage(res, 'expired');
    if (query.error) return finishPage(res, query.error === 'access_denied' ? 'cancelled' : 'failed');

    try {
      const { over18 } = await provider.finish(p, query);
      if (!over18) {
        onEvent('auto', 'Bank age check: person is not 18+. Entry refused.');
        return finishPage(res, 'under18');
      }
      res.set('Set-Cookie', [clearState, cookieString(PASS_COOKIE, passes.issue(), { maxAgeSec: PASS_HOURS * 3600, secure: secureCookies })]);
      return finishPage(res, 'verified');
    } catch (err) {
      console.error('[age] verification failed:', err.message);
      return finishPage(res, 'failed');
    }
  });

  if (provider.name === 'mock') {
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    app.get('/verify/mock-bank', (req, res) => {
      const state = String(req.query.state || '');
      const yes = provider.approve(state, true);
      const no = provider.approve(state, false);
      const cb = (q) => `/verify/callback?${new URLSearchParams({ state, ...q })}`;
      res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pretend Bank</title><link rel="stylesheet" href="/styles.css">
<main class="card narrow"><h1>Pretend Bank</h1>
<p class="warn"><strong>Testing only.</strong> This stands in for a real bank's ConnectID screen.</p>
<p><strong>Afterhours</strong> is asking to confirm you are <strong>18 or older</strong>.<br>It will not receive your name, date of birth or anything else.</p>
<div class="row">
<a class="button primary" id="mock-yes" href="${esc(cb({ code: yes }))}">Share: I'm 18 or older</a>
<a class="button" id="mock-no" href="${esc(cb({ code: no }))}">Share: I'm under 18</a>
<a class="button ghost" id="mock-cancel" href="${esc(cb({ error: 'access_denied' }))}">Cancel</a>
</div></main>`);
    });
  }

  return { isVerified };
}

module.exports = { createProvider, mountAgeVerification, makePassSigner, parseCookies, PASS_COOKIE };
