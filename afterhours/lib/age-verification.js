'use strict';

// 18+ checks with an outside provider, before anyone can go online.
//
// Two real methods, which can be offered side by side so people can choose:
//
//   yoti      – Yoti facial age estimation. The person takes a selfie on Yoti's
//               page; Yoti estimates their age, deletes the image, and tells us
//               only whether they passed our threshold (default: looks 25+).
//   connectid – ConnectID (Australian Payments Plus). The person approves at their
//               own bank, which tells us only whether they are over 18.
//
// Either way we receive yes/no, store nothing on the server, and give the
// browser a signed "18+ confirmed" pass (a cookie) for a few hours.
//
// AGE_VERIFICATION is a comma-separated list, shown to people in that order:
//   none (default)  – self-declared date of birth only
//   yoti            – needs YOTI_SDK_ID, YOTI_API_KEY, PUBLIC_URL
//   connectid       – needs the ConnectID SDK (approved participants only) and CONNECTID_*
//   mock            – a pretend bank AND a pretend selfie check for development and
//                     tests (also mock-bank / mock-selfie). Refused in production.

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
// Every provider has the same shape, so the routes don't care which is used:
//   name, kind ('bank' | 'selfie'), check()
//   options()                      → [{ id, name, logo, fallback }]
//   start(optionId, ctx)           → { authUrl, state?, data }   (ctx: state, callbackUrl, cancelUrl)
//   finish(data, query)            → { over18: boolean, definitive: boolean }
// "definitive" says whether a "no" means "under 18" (a bank knows your birthday) or
// only "couldn't confirm" (a face that doesn't look 25+ may still be 19).

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
    kind: 'bank',
    async check() {
      await client();
    },
    async options() {
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
      // ConnectID makes its own state; the bank returns it to /verify/callback.
      return { authUrl: r.authUrl, state: r.state, data: { authServerId, codeVerifier: r.codeVerifier, state: r.state, nonce: r.nonce } };
    },
    async finish(d, query) {
      const c = await client();
      const tokens = await c.retrieveTokens(d.authServerId, query, d.codeVerifier, d.state, d.nonce);
      const claims = tokens.consolidatedClaims();
      return { over18: claims.over18 === true, definitive: true };
    },
  };
}

// Yoti facial age estimation, using Yoti's hosted Age Verification service.
// Docs: Yoti developer documentation → Age Verification (create a session, launch
// the user view, get session result).
function yotiProvider(env, fetchImpl = globalThis.fetch) {
  const missing = ['YOTI_SDK_ID', 'YOTI_API_KEY', 'PUBLIC_URL'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Yoti is missing settings: ${missing.join(', ')}`);
  const threshold = Number(env.YOTI_THRESHOLD) || 25;
  if (threshold < 18) throw new Error('YOTI_THRESHOLD must be 18 or more (25 is recommended).');
  const apiBase = (env.YOTI_API_BASE || 'https://age.yoti.com/api/v1').replace(/\/$/, '');
  const userView = env.YOTI_USER_VIEW_URL || 'https://age.yoti.com';
  const headers = {
    Authorization: `Bearer ${env.YOTI_API_KEY}`,
    'Yoti-Sdk-Id': env.YOTI_SDK_ID,
    'Content-Type': 'application/json',
  };

  async function call(method, path, body) {
    const res = await fetchImpl(apiBase + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Yoti ${method} ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
  }

  return {
    name: 'yoti',
    kind: 'selfie',
    threshold,
    async check() {},
    async options() {
      return [{ id: 'fae', name: 'Selfie age check', logo: '', fallback: false }];
    },
    async start(optionId, { state, callbackUrl, cancelUrl }) {
      const session = await call('POST', '/sessions', {
        type: 'OVER',
        ttl: 900,
        reference_id: state,
        age_estimation: { allowed: true, threshold, level: 'PASSIVE', retry_limit: 1 },
        callback: { auto: true, url: callbackUrl },
        cancel_url: cancelUrl,
      });
      const id = session.id || session.session_id;
      if (!id) throw new Error('Yoti did not return a session id');
      const url = new URL(userView);
      url.searchParams.set('sessionId', id);
      url.searchParams.set('sdkId', env.YOTI_SDK_ID);
      return { authUrl: url.toString(), data: { sessionId: id, state } };
    },
    async finish(d) {
      // The person is back from Yoti; the decision is normally ready. Allow a few
      // seconds in case it's still being processed.
      let r;
      for (let i = 0; i < 6; i++) {
        r = await call('GET', `/sessions/${encodeURIComponent(d.sessionId)}/result`);
        if (r.status !== 'IN_PROGRESS' && r.status !== 'PENDING') break;
        await new Promise((ok) => setTimeout(ok, 1500));
      }
      if (r.reference_id && r.reference_id !== d.state) throw new Error('Yoti result does not belong to this check');
      if (r.status === 'COMPLETE') return { over18: true, definitive: false };
      if (r.status === 'FAIL') return { over18: false, definitive: false };
      if (r.status === 'CANCELLED') return { cancelled: true };
      throw new Error(`Yoti session ended with status ${r.status}`);
    },
  };
}

// Pretend providers: same flow, no real check. For development and tests only.
function mockProvider(env, kind) {
  if (env.NODE_ENV === 'production' && env.AGE_VERIFICATION_ALLOW_MOCK !== '1') {
    throw new Error('AGE_VERIFICATION=mock is a pretend age check and cannot be used in production.');
  }
  const codes = new Map(); // code -> { state, pass }
  const bank = kind === 'bank';
  return {
    name: bank ? 'mock-bank' : 'mock-selfie',
    kind,
    mock: true,
    threshold: 25,
    async check() {},
    async options() {
      return bank
        ? [
            { id: 'mock-bank', name: 'Pretend Bank (testing only)', logo: '', fallback: false },
            { id: 'mock-docs', name: 'Verify with ID documents (testing only)', logo: '', fallback: true },
          ]
        : [{ id: 'fae', name: 'Pretend selfie check (testing only)', logo: '', fallback: false }];
    },
    async start(optionId, { state }) {
      return { authUrl: `/verify/mock?kind=${kind}&state=${state}`, data: { state } };
    },
    approve(state, pass) {
      const code = crypto.randomBytes(12).toString('base64url');
      codes.set(code, { state, pass });
      return code;
    },
    async finish(d, query) {
      const c = codes.get(query.code);
      codes.delete(query.code);
      if (!c || c.state !== d.state) throw new Error('invalid code');
      return { over18: c.pass, definitive: bank };
    },
  };
}

function createProviders(env = process.env, { fetchImpl } = {}) {
  // Render sets RENDER_EXTERNAL_URL automatically, so PUBLIC_URL is optional there.
  env = { ...env, PUBLIC_URL: env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '' };
  const names = String(env.AGE_VERIFICATION || 'none')
    .toLowerCase()
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x && x !== 'none')
    .flatMap((x) => (x === 'mock' ? ['mock-selfie', 'mock-bank'] : [x]));
  return [...new Set(names)].map((n) => {
    if (n === 'connectid') return connectIdProvider(env);
    if (n === 'yoti') return yotiProvider(env, fetchImpl);
    if (n === 'mock-bank') return mockProvider(env, 'bank');
    if (n === 'mock-selfie') return mockProvider(env, 'selfie');
    throw new Error(`Unknown AGE_VERIFICATION "${n}" (use none, yoti, connectid or mock).`);
  });
}

// ---------------------------------------------------------------- routes
function mountAgeVerification(app, { providers, getSecret, secureCookies, publicUrl = '', onEvent = () => {} }) {
  const passes = makePassSigner(getSecret);
  const byName = new Map(providers.map((p) => [p.name, p]));
  const pending = new Map(); // state -> { provider, data, at }
  const startLimiter = new Map(); // ip -> [timestamps]

  const prune = () => {
    const cutoff = Date.now() - PENDING_MS;
    for (const [k, v] of pending) if (v.at < cutoff) pending.delete(k);
  };
  setInterval(prune, 60_000).unref();

  const isVerified = (cookieHeader) => !providers.length || passes.check(parseCookies(cookieHeader)[PASS_COOKIE]);

  app.get('/verify/status', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ required: providers.length > 0, methods: providers.map((p) => p.name), verified: isVerified(req.headers.cookie) });
  });

  if (!providers.length) return { isVerified };

  // The choices to show, grouped by method, in the configured order.
  app.get('/verify/options', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const methods = await Promise.all(providers.map(async (p) => {
      try {
        return { method: p.name, kind: p.kind, threshold: p.kind === 'selfie' ? p.threshold : undefined, options: await p.options() };
      } catch (err) {
        console.error(`[age] ${p.name} options unavailable:`, err.message);
        return { method: p.name, kind: p.kind, options: [], unavailable: true };
      }
    }));
    res.json({ methods });
  });

  app.post('/verify/start', require('express').json({ limit: '1kb' }), async (req, res) => {
    // JSON-only, so a form on another site can't start a check on someone's behalf.
    if (!req.is('application/json')) return res.status(415).json({ error: 'Unsupported request.' });
    const ip = req.ip || '';
    const recent = (startLimiter.get(ip) || []).filter((t) => Date.now() - t < 10 * 60_000);
    if (recent.length >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    recent.push(Date.now());
    startLimiter.set(ip, recent);

    const provider = byName.get(String(req.body?.method || ''));
    const optionId = String(req.body?.optionId || '');
    if (!provider) return res.status(400).json({ error: 'Choose one of the options shown.' });
    try {
      if (!(await provider.options()).some((o) => o.id === optionId)) return res.status(400).json({ error: 'Choose one of the options shown.' });
      prune();
      const ourState = crypto.randomBytes(18).toString('base64url');
      const base = publicUrl.replace(/\/$/, '');
      const r = await provider.start(optionId, {
        state: ourState,
        callbackUrl: `${base}/verify/callback?state=${ourState}`,
        cancelUrl: `${base}/verify/callback?state=${ourState}&error=access_denied`,
      });
      const state = r.state || ourState;
      pending.set(state, { provider: provider.name, data: r.data, at: Date.now() });
      // Ties the reply to this browser: a callback carrying someone else's state is rejected.
      res.set('Set-Cookie', cookieString(STATE_COOKIE, state, { maxAgeSec: PENDING_MS / 1000, secure: secureCookies }));
      res.json({ authUrl: r.authUrl });
    } catch (err) {
      console.error(`[age] could not start ${provider.name}:`, err.message);
      res.status(503).json({ error: 'That check is unavailable right now. Please try again or choose another option.' });
    }
  });

  const finishPage = (res, outcome) => res.redirect(303, `/?age=${outcome}`);

  app.get('/verify/callback', async (req, res) => {
    const clearState = cookieString(STATE_COOKIE, '', { maxAgeSec: 0, secure: secureCookies });
    const one = (v) => (Array.isArray(v) ? v[0] : v);
    const query = {
      code: one(req.query.code), state: one(req.query.state), iss: one(req.query.iss),
      error: one(req.query.error), error_description: one(req.query.error_description),
    };
    const state = String(query.state || '');
    const p = pending.get(state);
    pending.delete(state);
    res.set('Set-Cookie', clearState);

    if (!p || parseCookies(req.headers.cookie)[STATE_COOKIE] !== state) return finishPage(res, 'expired');
    if (query.error) return finishPage(res, query.error === 'access_denied' ? 'cancelled' : 'failed');

    const provider = byName.get(p.provider);
    try {
      const r = await provider.finish(p.data, query);
      if (r.cancelled) return finishPage(res, 'cancelled');
      if (!r.over18) {
        if (r.definitive) {
          onEvent('auto', `Age check (${provider.kind === 'bank' ? 'bank' : 'selfie'}): person is not 18+. Entry refused.`);
          return finishPage(res, 'under18');
        }
        // A face that doesn't look 25+ isn't proof of being under 18: offer another way.
        return finishPage(res, 'notconfirmed');
      }
      res.set('Set-Cookie', [clearState, cookieString(PASS_COOKIE, passes.issue(), { maxAgeSec: PASS_HOURS * 3600, secure: secureCookies })]);
      return finishPage(res, 'verified');
    } catch (err) {
      console.error(`[age] ${provider.name} check failed:`, err.message);
      return finishPage(res, 'failed');
    }
  });

  const mocks = providers.filter((p) => p.mock);
  if (mocks.length) {
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    app.get('/verify/mock', (req, res) => {
      const bank = req.query.kind === 'bank';
      const provider = mocks.find((m) => m.kind === (bank ? 'bank' : 'selfie'));
      if (!provider) return res.status(404).end();
      const state = String(req.query.state || '');
      const yes = provider.approve(state, true);
      const no = provider.approve(state, false);
      const cb = (q) => `/verify/callback?${new URLSearchParams({ state, ...q })}`;
      const title = bank ? 'Pretend Bank' : 'Pretend selfie check';
      const ask = bank
        ? '<strong>Afterhours</strong> is asking to confirm you are <strong>18 or older</strong>.<br>It will not receive your name, date of birth or anything else.'
        : '<strong>Afterhours</strong> needs to check you look <strong>25 or older</strong>.<br>A real check would take a selfie here and delete it straight away.';
      res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="/styles.css">
<main class="card narrow"><h1>${title}</h1>
<p class="warn"><strong>Testing only.</strong> This stands in for ${bank ? "a real bank's ConnectID screen" : "Yoti's selfie age check"}.</p>
<p>${ask}</p>
<div class="row">
<a class="button primary" id="mock-yes" href="${esc(cb({ code: yes }))}">${bank ? "Share: I'm 18 or older" : 'Pass: looks 25+'}</a>
<a class="button" id="mock-no" href="${esc(cb({ code: no }))}">${bank ? "Share: I'm under 18" : "Fail: doesn't look 25+"}</a>
<a class="button ghost" id="mock-cancel" href="${esc(cb({ error: 'access_denied' }))}">Cancel</a>
</div></main>`);
    });
  }

  return { isVerified };
}

module.exports = { createProviders, mountAgeVerification, makePassSigner, parseCookies, PASS_COOKIE };
