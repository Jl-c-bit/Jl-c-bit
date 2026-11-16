'use strict';
process.env.AGE_VERIFICATION = 'mock';
const test = require('node:test');
const assert = require('node:assert');
const { io: client } = require('socket.io-client');
const { server, io, ready } = require('../server');
const { makePassSigner, createProviders } = require('../lib/age-verification');

const profile = (over) => ({
  nickname: 'Alex', dob: '1990-01-01', gender: 'man', seeking: ['woman'],
  intents: ['hookup'], confirmAdult: true, agreeRules: true, consentData: true, ...over,
});
const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));

// A tiny cookie jar so we can follow the flow like a browser does.
function browser(base) {
  const jar = new Map();
  const store = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const [k, v] = pair.split('=');
      if (/max-age=0/i.test(attrs.join(';'))) jar.delete(k.trim());
      else jar.set(k.trim(), v);
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  return {
    jar, cookie,
    async get(path) {
      const res = await fetch(base + path, { headers: { cookie: cookie() }, redirect: 'manual' });
      store(res);
      return res;
    },
    async post(path, body, type = 'application/json') {
      const res = await fetch(base + path, { method: 'POST', headers: { cookie: cookie(), 'content-type': type }, body: JSON.stringify(body) });
      store(res);
      return res;
    },
  };
}

async function verifyVia(b, button, method = 'mock-bank', optionId = 'mock-bank') {
  const start = await (await b.post('/verify/start', { method, optionId })).json();
  assert.match(start.authUrl, /^\/verify\/mock\?/);
  const page = await (await b.get(start.authUrl)).text();
  const href = page.match(new RegExp(`id="${button}" href="([^"]+)"`))[1].replace(/&amp;/g, '&');
  const cb = await b.get(href);
  assert.equal(cb.status, 303);
  return cb.headers.get('location');
}

test('bank age check (pretend bank)', async (t) => {
  await ready;
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const sockets = [];
  t.after(() => { sockets.forEach((s) => s.close()); io.close(); server.close(); });
  const connect = (cookie) => {
    const s = client(base, { transports: ['websocket'], forceNew: true, extraHeaders: cookie ? { cookie } : {} });
    sockets.push(s);
    return s;
  };

  await t.test('joining without verifying is refused', async () => {
    const b = browser(base);
    const st = await (await b.get('/verify/status')).json();
    assert.deepEqual(st, { required: true, methods: ['mock-selfie', 'mock-bank'], verified: false });
    const r = await emit(connect(), 'join', profile());
    assert.equal(r.ok, false);
    assert.equal(r.needsVerification, true);
  });

  await t.test('bank confirms 18+ → pass cookie → can join', async () => {
    const b = browser(base);
    const methods = (await (await b.get('/verify/options')).json()).methods;
    assert.deepEqual(methods.map((m) => m.kind), ['selfie', 'bank']);
    assert.equal(methods[0].threshold, 25);
    const bank = methods[1].options;
    assert.ok(bank.some((x) => x.id === 'mock-bank') && bank.some((x) => x.fallback));
    assert.equal(await verifyVia(b, 'mock-yes'), '/?age=verified');
    assert.ok(b.jar.has('ah_age'), 'pass cookie set');
    assert.ok(!b.jar.has('ah_age_state'), 'state cookie cleared');
    assert.equal((await (await b.get('/verify/status')).json()).verified, true);
    const r = await emit(connect(b.cookie()), 'join', profile());
    assert.equal(r.ok, true);
  });

  await t.test('bank says under 18 → no pass, logged', async () => {
    const b = browser(base);
    assert.equal(await verifyVia(b, 'mock-no'), '/?age=under18');
    assert.ok(!b.jar.has('ah_age'));
  });

  await t.test("selfie that doesn't look 25+ is 'not confirmed', not 'under 18'", async () => {
    const b = browser(base);
    assert.equal(await verifyVia(b, 'mock-no', 'mock-selfie', 'fae'), '/?age=notconfirmed');
    assert.ok(!b.jar.has('ah_age'));
    assert.equal(await verifyVia(b, 'mock-yes', 'mock-selfie', 'fae'), '/?age=verified');
    assert.ok(b.jar.has('ah_age'));
  });

  await t.test('cancelling at the bank', async () => {
    const b = browser(base);
    assert.equal(await verifyVia(b, 'mock-cancel'), '/?age=cancelled');
    assert.ok(!b.jar.has('ah_age'));
  });

  await t.test("someone else's callback link doesn't work in your browser", async () => {
    const victim = browser(base), attacker = browser(base);
    const start = await (await attacker.post('/verify/start', { method: 'mock-bank', optionId: 'mock-bank' })).json();
    const page = await (await attacker.get(start.authUrl)).text();
    const href = page.match(/id="mock-yes" href="([^"]+)"/)[1].replace(/&amp;/g, '&');
    const cb = await victim.get(href); // victim has no matching state cookie
    assert.equal(cb.headers.get('location'), '/?age=expired');
    assert.ok(!victim.jar.has('ah_age'));
  });

  await t.test('a code can only be used once', async () => {
    const b = browser(base);
    const start = await (await b.post('/verify/start', { method: 'mock-bank', optionId: 'mock-bank' })).json();
    const page = await (await b.get(start.authUrl)).text();
    const href = page.match(/id="mock-yes" href="([^"]+)"/)[1].replace(/&amp;/g, '&');
    assert.equal((await b.get(href)).headers.get('location'), '/?age=verified');
    b.jar.delete('ah_age');
    assert.equal((await b.get(href)).headers.get('location'), '/?age=expired');
  });

  await t.test('forged or tampered passes are rejected', async () => {
    const r = await emit(connect('ah_age=eyJ2IjoxLCJvdmVyMTgiOnRydWUsImV4cCI6OTk5OTk5OTk5OTk5OX0.forged'), 'join', profile());
    assert.equal(r.needsVerification, true);
  });

  await t.test('legal pages describe the bank check when it is on', async () => {
    const privacy = await (await fetch(base + '/privacy')).text();
    const terms = await (await fetch(base + '/terms')).text();
    assert.ok(privacy.includes('ConnectID and your bank') && privacy.includes('Yoti Ltd') && privacy.includes('12 hours'));
    assert.ok(terms.includes('complete the check <strong>yourself</strong>') && terms.includes('selfie age check by Yoti'));
    assert.ok(!privacy.includes('<!--if:'), 'markers removed');
  });

  await t.test('start rejects unknown methods/options and non-JSON posts', async () => {
    const b = browser(base);
    assert.equal((await b.post('/verify/start', { method: 'mock-bank', optionId: 'evil' })).status, 400);
    assert.equal((await b.post('/verify/start', { method: 'evil', optionId: 'fae' })).status, 400);
    assert.equal((await b.post('/verify/start', { method: 'mock-bank', optionId: 'mock-bank' }, 'text/plain')).status, 415);
  });
});

test('pass signer: expiry and tampering', () => {
  const s = makePassSigner(() => 'secret-1');
  const tok = s.issue(1000);
  assert.ok(s.check(tok, 2000));
  assert.ok(!s.check(tok, 1000 + 13 * 3600e3), 'expires after 12h');
  assert.ok(!makePassSigner(() => 'other').check(tok, 2000), 'other secret rejects');
  const [body, sig] = tok.split('.');
  const evil = Buffer.from(JSON.stringify({ v: 1, over18: true, exp: 9e15 })).toString('base64url');
  assert.ok(!s.check(`${evil}.${sig}`, 2000));
  assert.ok(!s.check(`${body}.x`, 2000));
});

test('provider selection', () => {
  assert.deepEqual(createProviders({}), []);
  assert.deepEqual(createProviders({ AGE_VERIFICATION: 'none' }), []);
  assert.throws(() => createProviders({ AGE_VERIFICATION: 'mock', NODE_ENV: 'production' }), /cannot be used in production/);
  assert.throws(() => createProviders({ AGE_VERIFICATION: 'connectid' }), /missing settings: CONNECTID_CLIENT_ID/);
  assert.throws(() => createProviders({ AGE_VERIFICATION: 'yoti' }), /Yoti is missing settings: YOTI_SDK_ID, YOTI_API_KEY, PUBLIC_URL/);
  assert.throws(() => createProviders({ AGE_VERIFICATION: 'yoti', YOTI_SDK_ID: 'a', YOTI_API_KEY: 'b', PUBLIC_URL: 'c', YOTI_THRESHOLD: '16' }), /18 or more/);
  assert.throws(() => createProviders({ AGE_VERIFICATION: 'bogus' }), /Unknown AGE_VERIFICATION/);
  const both = createProviders({ AGE_VERIFICATION: ' Yoti , mock-bank ', YOTI_SDK_ID: 'a', YOTI_API_KEY: 'b', PUBLIC_URL: 'c' });
  assert.deepEqual(both.map((p) => p.name), ['yoti', 'mock-bank'], 'order kept, case/space tolerant');
  assert.doesNotThrow(() => createProviders({ AGE_VERIFICATION: 'yoti', YOTI_SDK_ID: 'a', YOTI_API_KEY: 'b', RENDER_EXTERNAL_URL: 'https://x.onrender.com' }), 'PUBLIC_URL detected on Render');
});

test('connectid provider explains a missing SDK instead of crashing', async () => {
  const env = {
    AGE_VERIFICATION: 'connectid', CONNECTID_CLIENT_ID: 'x', CONNECTID_SIGNING_KID: 'k',
    CONNECTID_REDIRECT_URI: 'https://example.com/verify/callback', CONNECTID_REGISTRY_URI: 'https://example.com/participants',
    CONNECTID_SIGNING_KEY: 'a', CONNECTID_SIGNING_PEM: 'b', CONNECTID_TRANSPORT_KEY: 'c', CONNECTID_TRANSPORT_PEM: 'd', CONNECTID_CA_PEM: 'e',
  };
  const [p] = createProviders(env);
  await assert.rejects(p.check(), /npm install @connectid-tools\/rp-nodejs-sdk/);
});
