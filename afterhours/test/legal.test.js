'use strict';
process.env.OPERATOR_NAME = 'Night & Day <Ltd>';
process.env.CONTACT_EMAIL = 'safety@example.com';
process.env.GOVERNING_LAW = 'England and Wales';
delete process.env.LEGAL_EFFECTIVE_DATE;
delete process.env.HOSTING_REGION;
const test = require('node:test');
const assert = require('node:assert');
const { server, io, ready } = require('../server');

test('terms and privacy pages are served with settings filled in', async (t) => {
  await ready;
  await new Promise((r) => server.listen(0, r));
  t.after(() => { io.close(); server.close(); });
  const base = `http://localhost:${server.address().port}`;

  for (const page of ['/terms', '/privacy']) {
    const res = await fetch(base + page);
    assert.equal(res.status, 200, page);
    const html = await res.text();
    assert.ok(!html.includes('{{'), `${page}: no raw placeholders left`);
    assert.ok(html.includes('Night &amp; Day &lt;Ltd&gt;'), `${page}: operator name escaped`);
    assert.ok(html.includes('href="mailto:safety@example.com"'), `${page}: contact email linked`);
    assert.ok(html.includes('[set LEGAL_EFFECTIVE_DATE]'), `${page}: unset values are flagged`);
  }
  const privacy = await (await fetch(base + '/privacy')).text();
  assert.ok(privacy.includes('[set HOSTING_REGION]'));
  assert.ok(privacy.includes('90 days'), 'retention period shown');
  const terms = await (await fetch(base + '/terms')).text();
  assert.ok(terms.includes('England and Wales'));
  assert.ok(terms.includes('Australian Consumer Law') && terms.includes('ACCCE') && terms.includes('esafety.gov.au/report'), 'Australian terms');
  assert.ok(privacy.includes('Australian Privacy Principles') && privacy.includes('oaic.gov.au'), 'Australian privacy');
  assert.ok(!/NCMEC|USD/.test(terms + privacy), 'no US-specific leftovers');
  assert.ok(!privacy.includes('ConnectID') && !privacy.includes('<!--if:'), 'bank-check sections hidden when off');

  const home = await (await fetch(base + '/')).text();
  assert.ok(home.includes('href="/terms"') && home.includes('href="/privacy"'), 'home links to both');
  assert.ok(home.includes('name="consentData"'), 'consent checkbox present');
  assert.ok(home.includes('1800 737 732') && home.includes('13 11 14'), 'Australian support lines in safety tips');
});
