'use strict';

// Pure logic for Afterhours: validation, safety filters, matching rules.
// Kept free of I/O so it can be unit-tested.

const MIN_AGE = 18;
const INTENTS = ['chat', 'flirt', 'dating', 'hookup'];
const GENDERS = ['woman', 'man', 'nonbinary', 'other'];
const REPORTS_TO_REMOVE = 3; // distinct reporters before a user is removed

function ageFromDob(dob, now = new Date()) {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

function clean(str, max) {
  return String(str ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Validates a join request. Returns { ok, profile } or { ok: false, error }.
function validateProfile(input, now = new Date()) {
  const p = input || {};
  if (p.confirmAdult !== true) return { ok: false, error: 'You must confirm you are 18 or older.' };
  if (p.agreeRules !== true) return { ok: false, error: 'You must agree to the community rules.' };

  const age = ageFromDob(p.dob, now);
  if (age === null) return { ok: false, error: 'Enter a valid date of birth.' };
  if (age < MIN_AGE) return { ok: false, error: 'Afterhours is for adults 18+ only.', underage: true };
  if (age > 100) return { ok: false, error: 'Enter a valid date of birth.' };

  const nickname = clean(p.nickname, 24);
  if (nickname.length < 2) return { ok: false, error: 'Nickname must be at least 2 characters.' };
  if (mentionsMinor(nickname)) return { ok: false, error: 'That nickname is not allowed.', underage: true };

  const gender = GENDERS.includes(p.gender) ? p.gender : 'other';
  const seeking = (Array.isArray(p.seeking) ? p.seeking : []).filter((g) => GENDERS.includes(g));
  const intents = (Array.isArray(p.intents) ? p.intents : []).filter((i) => INTENTS.includes(i));
  if (intents.length === 0) return { ok: false, error: 'Pick at least one thing you are looking for.' };

  const bio = clean(p.bio, 280);
  if (mentionsMinor(bio)) return { ok: false, error: 'Your bio was not allowed.', underage: true };

  return {
    ok: true,
    profile: {
      nickname,
      age,
      gender,
      seeking: seeking.length ? seeking : GENDERS.slice(),
      intents,
      city: clean(p.city, 40),
      bio,
    },
  };
}

// Do two profiles want each other (gender preferences both ways + a shared intent)?
function compatible(a, b) {
  if (!a.seeking.includes(b.gender) || !b.seeking.includes(a.gender)) return false;
  return a.intents.some((i) => b.intents.includes(i));
}

// Flags text where someone says they are under 18, or asks for/mentions minors
// in a sexual context. Deliberately errs on the side of catching too much:
// a false positive costs a reworded message; a miss can cost a child's safety.
const MINOR_PATTERNS = [
  /\b(i'?m|i am|im|age|aged|turning|just turned)\s*(1[0-7]|[1-9])\b(?!\s*(?:cm|kg|lb|in|ft|"|'|inch|min|hour|h\b|k\b|%))/i,
  /\b(1[0-7]|[1-9])\s*(yo|y\/o|yrs? old|years? old|year-old)\b/i,
  /\b(1[0-7]|[1-9])\s*[mf]\b/i,
  /\b(underage|under ?age|minor|jailbait|loli|lolita|shota|preteen|pre-teen|cp)\b/i,
  /\b(middle|high|elementary|junior high)\s*school(er)?\b/i,
  /\b(freshman|sophomore)\s+in\s+high\b/i,
  /\b(\d{1,2})(th)?\s*grade(r)?\b/i,
  /\bchild\b.*\b(sex|nude|naked|pics?)\b|\b(sex|nude|naked|pics?)\b.*\bchild\b/i,
];

function mentionsMinor(text) {
  const t = String(text || '');
  return MINOR_PATTERNS.some((re) => re.test(t));
}

// Messages are text-only. Block contact-info/money patterns that are the
// usual vector for scams and trafficking ("send $$ on cashapp", "dm me on...").
const SCAM_PATTERNS = [
  /\b(cash\s?app|venmo|zelle|paypal\.me|gift\s?card|bitcoin|btc|usdt|crypto wallet)\b/i,
  /\b(only\s?fans|onlyfans|fansly)\b/i,
  /\$\s?\d+\s*(for|per|\/)\s*(hr|hour|night|session|pics?|vids?)/i,
  /\b(roses|donation)s?\b.*\b(per|for)\b/i,
];

function looksLikeSolicitation(text) {
  return SCAM_PATTERNS.some((re) => re.test(String(text || '')));
}

function checkMessage(text) {
  const body = clean(text, 1000);
  if (!body) return { ok: false, error: 'Empty message.' };
  if (mentionsMinor(body)) return { ok: false, error: 'Message blocked.', underage: true };
  if (looksLikeSolicitation(body)) {
    return { ok: false, error: 'Payments, selling, and paid-content links are not allowed here.' };
  }
  return { ok: true, body };
}

// Simple sliding-window rate limiter.
function makeRateLimiter(limit, windowMs) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) {
      hits.set(key, arr);
      return false;
    }
    arr.push(now);
    hits.set(key, arr);
    return true;
  };
}

module.exports = {
  MIN_AGE,
  INTENTS,
  GENDERS,
  REPORTS_TO_REMOVE,
  ageFromDob,
  validateProfile,
  compatible,
  mentionsMinor,
  looksLikeSolicitation,
  checkMessage,
  makeRateLimiter,
};
