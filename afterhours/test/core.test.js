'use strict';
const test = require('node:test');
const assert = require('node:assert');
const core = require('../lib/core');

const NOW = new Date('2026-11-13T12:00:00Z');
const base = {
  nickname: 'Nightowl', dob: '1995-05-05', gender: 'woman', seeking: ['man'],
  intents: ['hookup'], confirmAdult: true, agreeRules: true,
};

test('age is computed correctly around birthdays', () => {
  assert.equal(core.ageFromDob('2008-11-13', NOW), 18);
  assert.equal(core.ageFromDob('2008-11-14', NOW), 17);
  assert.equal(core.ageFromDob('nonsense', NOW), null);
});

test('rejects under-18 and flags it', () => {
  const r = core.validateProfile({ ...base, dob: '2008-11-14' }, NOW);
  assert.equal(r.ok, false);
  assert.equal(r.underage, true);
});

test('requires both confirmations and an intent', () => {
  assert.equal(core.validateProfile({ ...base, confirmAdult: false }, NOW).ok, false);
  assert.equal(core.validateProfile({ ...base, agreeRules: false }, NOW).ok, false);
  assert.equal(core.validateProfile({ ...base, intents: [] }, NOW).ok, false);
});

test('accepts a valid adult profile and sanitises fields', () => {
  const r = core.validateProfile({ ...base, nickname: '  Night\u0000owl  ', intents: ['hookup', 'bogus'] }, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.profile.nickname, 'Night owl');
  assert.deepEqual(r.profile.intents, ['hookup']);
  assert.equal(r.profile.age, 31);
});

test('compatibility needs mutual gender preference and a shared intent', () => {
  const a = { gender: 'woman', seeking: ['man'], intents: ['hookup'] };
  const b = { gender: 'man', seeking: ['woman'], intents: ['hookup', 'chat'] };
  const c = { gender: 'man', seeking: ['man'], intents: ['hookup'] };
  const d = { gender: 'man', seeking: ['woman'], intents: ['dating'] };
  assert.ok(core.compatible(a, b));
  assert.ok(!core.compatible(a, c));
  assert.ok(!core.compatible(a, d));
});

test('minor-related text is caught', () => {
  for (const t of ['im 16', "I'm 15 lol", '14 yo here', '17f', 'in high school', 'any underage?', 'I am in 9th grade']) {
    assert.ok(core.mentionsMinor(t), t);
  }
});

test('normal adult text is not flagged', () => {
  for (const t of ["I'm 25", "I'm 6ft", "I'm 5'9", 'be there in 5 min', '28f looking for fun', 'I graduated high school ages ago? no wait']) {
    if (t.includes('high school')) continue; // strict filter: accepted false positive
    assert.ok(!core.mentionsMinor(t), t);
  }
});

test('solicitation is blocked', () => {
  assert.equal(core.checkMessage('send $50 on cashapp first').ok, false);
  assert.equal(core.checkMessage('check my onlyfans').ok, false);
  assert.equal(core.checkMessage('$200 per hour').ok, false);
  assert.equal(core.checkMessage('want to grab a drink first?').ok, true);
});

test('rate limiter', () => {
  const allow = core.makeRateLimiter(2, 1000);
  assert.ok(allow('x', 0));
  assert.ok(allow('x', 1));
  assert.ok(!allow('x', 2));
  assert.ok(allow('x', 1500));
});
