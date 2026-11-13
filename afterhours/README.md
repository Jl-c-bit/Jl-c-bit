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
| Privacy | DOB and preferences never leave the server; chats aren't stored beyond the last 20 messages in memory, shown to moderators only if reported |

## Run it

```bash
cd afterhours
npm install
MOD_PASSWORD='pick-a-long-password' npm start   # site: http://localhost:3000
npm test                                         # dashboard: http://localhost:3000/mod/
```

| Setting | What it does |
|---|---|
| `MOD_PASSWORD` | Turns on the moderator dashboard at `/mod/`. Must be 12+ characters; without it the dashboard is off. |
| `TRUST_PROXY=1` | Set this on Render/Railway/Fly so bans use the visitor's real address, not the host's load balancer. |
| `PORT` | Set automatically by most hosts. |

## Moderator dashboard (`/mod/`)

Sign in with your name and the shared password. Everything updates live.

- **Reports** — newest first, "may be under 18" pinned in red. Each shows the
  reported person's profile and the last 20 messages between them and the
  reporter, so you can see what actually happened. Actions: Ban (24h / 7d / 30d /
  permanent), Kick, Warn, Dismiss. Reports the system already acted on are
  marked "please review" so you can confirm or lift the automatic ban.
- **Online** — everyone currently on the site, people with reports or filter
  strikes sorted to the top. Warn, kick, or ban anyone.
- **Bans** — active bans with reason, who issued them, and time left. Lift any ban.
- **Activity** — log of automatic actions, blocked messages, reports and every
  moderator action (with the moderator's name).

Privacy: moderators never see raw IP addresses (only an 8-character fingerprint),
and chats are only visible if someone reports them. 5 wrong passwords lock that
address out for 15 minutes.

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
4. **Persistent bans and reports** (database) — today they reset when the server restarts.
5. **Individual moderator accounts** instead of one shared password, once you have more than a couple of moderators.
6. Avoid anything that facilitates paid sex — in the US, FOSTA-SESTA makes
   site operators liable. The selling filter helps but isn't a substitute for moderation.
