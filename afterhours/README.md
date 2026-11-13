# Afterhours

A free, adults-only (18+) website where strangers meet, chat, and decide for
themselves whether to meet up or hook up.

Think of it like a bar with a good bouncer: anyone over 18 can walk in, you can
see who's around and what they're after, but nobody can talk to you unless you
say yes, and anyone causing trouble gets thrown out.

## How it works

- **No accounts.** Pick a nickname, date of birth, who you're into, and what
  you want (chatting, flirting, dating, hookups). Nothing is stored; closing
  the tab deletes you.
- **Mutual matching.** You only see people whose preferences match yours both ways.
- **Consent to chat.** You send a request; the other person must accept before
  any messages flow. Declines are silent.
- **Text only.** No photo or video uploads (removes the biggest abuse and
  legal risk: illegal images).

## Safety built in

| Protection | What it does |
|---|---|
| Age gate + DOB check | Under-18 DOB is refused and the IP is banned for 24h |
| Minor-language filter | Messages/bios suggesting someone is under 18 are blocked; second strike removes the user |
| Selling filter | Blocks payment apps, paid-content and "$ per hour" offers (scams, trafficking) |
| Report / block | Reporting also blocks; 3 reports (or 1 "may be under 18") removes the user |
| Rate limits | 20 messages / 30s, 10 chat requests / min |
| Privacy | DOB and preferences never leave the server; no logs of messages |

## Run it

```bash
cd afterhours
npm install
npm start          # http://localhost:3000
npm test
```

## Hosting (free tiers)

Needs a host that supports WebSockets — **not** Netlify static/functions.
Render, Railway, or Fly.io all work: point them at this folder,
build `npm install`, start `npm start`.

## Before opening it to the public

This is a working prototype. A real launch needs:

1. **Real age verification.** Many places (UK Online Safety Act, several US
   states, France, Australia) legally require more than a checkbox for sites
   with sexual content. Use a provider such as Yoti, Veriff, or Persona.
2. **Terms of service and privacy policy**, and a way to receive abuse reports by email.
3. **Human moderation** and a process to report child exploitation to NCMEC
   (US) / IWF (UK) if it ever appears.
4. **Persistent bans** (database) instead of in-memory ones.
5. Avoid anything that facilitates paid sex — in the US, FOSTA-SESTA makes
   site operators liable. The selling filter helps but isn't a substitute for moderation.
