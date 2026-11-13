'use strict';
// Runs the real Yoti provider code against a fake Yoti API, through the site's own routes.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

// ---- fake Yoti API ----
const yoti = { sessions: new Map(), results: [], requests: [], failCreate: false };
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    yoti.requests.push({ method: req.method, url: req.url, headers: req.headers, body: body && JSON.parse(body) });
    const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== 'Bearer test-api-key' || req.headers['yoti-sdk-id'] !== 'test-sdk') return json(401, { error: 'unauthorised' });
    if (req.method === 'POST' && req.url === '/api/v1/sessions') {
      if (yoti.failCreate) return json(500, { error: 'boom' });
      const id = 'sess-' + (yoti.sessions.size + 1);
      yoti.sessions.set(id, JSON.parse(body));
      return json(200, { id, expires_at: '2099-01-01T00:00:00Z' });
    }
    const m = req.url.match(/^\/api\/v1\/sessions\/([^/]+)\/result$/);
    if (req.method === 'GET' && m && yoti.sessions.has(m[1])) {
      const next = yoti.results.length > 1 ? yoti.results.shift() : yoti.results[0];
      const s = yoti.sessions.get(m[1]);
      return json(200, { id: m[1], reference_id: next.reference_id ?? s.reference_id, status: next.status, method: 'AGE_ESTIMATION' });
    }
    json(404, {});
  });
});

let base, server, io;
test.before(async () => {
  await new Promise((r) => fake.listen(0, r));
  Object.assign(process.env, {
    AGE_VERIFICATION: 'yoti,mock-bank',
    YOTI_SDK_ID: 'test-sdk',
    YOTI_API_KEY: 'test-api-key',
    YOTI_API_BASE: `http://localhost:${fake.address().port}/api/v1`,
    PUBLIC_URL: 'http://site.invalid',
  });
  ({ server, io } = require('../server'));
  await require('../server').ready;
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
test.after(() => { io.close(); server.close(); fake.close(); });

function browser() {
  const jar = new Map();
  const keep = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const [k, v] = pair.split('=');
      if (/max-age=0/i.test(attrs.join(';'))) jar.delete(k.trim()); else jar.set(k.trim(), v);
    }
    return res;
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  return {
    jar,
    get: async (url) => keep(await fetch(url.replace('http://site.invalid', base), { headers: { cookie: cookie() }, redirect: 'manual' })),
    start: async () => keep(await fetch(base + '/verify/start', {
      method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/json' }, body: JSON.stringify({ method: 'yoti', optionId: 'fae' }),
    })),
  };
}

// Start a selfie check, then come back the way Yoti would send the person back.
async function selfie(status, { via = 'callback', reference_id } = {}) {
  yoti.results = (Array.isArray(status) ? status : [status]).map((s) => ({ status: s, reference_id }));
  const b = browser();
  const res = await b.start();
  assert.equal(res.status, 200);
  const { authUrl } = await res.json();
  const u = new URL(authUrl);
  assert.equal(u.origin, 'https://age.yoti.com');
  const session = yoti.sessions.get(u.searchParams.get('sessionId'));
  assert.equal(u.searchParams.get('sdkId'), 'test-sdk');
  const back = await b.get(via === 'cancel' ? session.cancel_url : session.callback.url);
  return { b, session, outcome: back.headers.get('location') };
}

test('creates a minimal Yoti session: over-25 face estimate only', async () => {
  const { session } = await selfie('COMPLETE');
  assert.equal(session.type, 'OVER');
  assert.deepEqual(session.age_estimation, { allowed: true, threshold: 25, level: 'PASSIVE', retry_limit: 1 });
  assert.equal(session.callback.auto, true);
  assert.match(session.callback.url, /^http:\/\/site\.invalid\/verify\/callback\?state=/);
  assert.match(session.cancel_url, /error=access_denied/);
  assert.equal(session.reference_id, new URL(session.callback.url).searchParams.get('state'));
  assert.ok(!('doc_scan' in session) && !('digital_id' in session), 'no ID documents requested');
});

test('COMPLETE → age pass', async () => {
  const { b, outcome } = await selfie('COMPLETE');
  assert.equal(outcome, '/?age=verified');
  assert.ok(b.jar.has('ah_age'));
});

test("FAIL → 'not confirmed' (offer the bank), never treated as under 18", async () => {
  const { b, outcome } = await selfie('FAIL');
  assert.equal(outcome, '/?age=notconfirmed');
  assert.ok(!b.jar.has('ah_age'));
});

test('result still processing → waits, then passes', async () => {
  const { outcome } = await selfie(['IN_PROGRESS', 'COMPLETE']);
  assert.equal(outcome, '/?age=verified');
});

test('cancelled at Yoti (cancel link or CANCELLED status)', async () => {
  assert.equal((await selfie('COMPLETE', { via: 'cancel' })).outcome, '/?age=cancelled');
  assert.equal((await selfie('CANCELLED')).outcome, '/?age=cancelled');
});

test('ERROR, or a result for a different check → failed, no pass', async () => {
  const e = await selfie('ERROR');
  assert.equal(e.outcome, '/?age=failed');
  const x = await selfie('COMPLETE', { reference_id: 'someone-elses-state' });
  assert.equal(x.outcome, '/?age=failed');
  assert.ok(!x.b.jar.has('ah_age'));
});

test('Yoti down → friendly error, bank option still listed', async () => {
  yoti.failCreate = true;
  try {
    const res = await browser().start();
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /another option/);
  } finally {
    yoti.failCreate = false;
  }
  const opts = await (await fetch(base + '/verify/options')).json();
  assert.deepEqual(opts.methods.map((m) => m.method), ['yoti', 'mock-bank']);
});

test('every Yoti call is authenticated with the API key and SDK id', () => {
  assert.ok(yoti.requests.length > 5);
  for (const r of yoti.requests) {
    assert.equal(r.headers.authorization, 'Bearer test-api-key');
    assert.equal(r.headers['yoti-sdk-id'], 'test-sdk');
  }
});
