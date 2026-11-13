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
| `DATABASE_URL` | Postgres connection string. Saves bans, reports and the moderation log so they survive restarts. Without it everything is in memory. |
| `IP_HASH_SECRET` | Optional. Key used to hash IP addresses. If unset, one is generated and kept in the database. |
| `RETENTION_DAYS` | Optional, default 90. How long closed reports (with chat excerpts) and the activity log are kept. |
| `OPERATOR_NAME` | Your name or company, shown as the operator / data controller on `/terms` and `/privacy`. |
| `CONTACT_EMAIL` | Where users send appeals, privacy requests and abuse reports. |
| `GOVERNING_LAW` | e.g. `England and Wales`, `the State of California`. |
| `LEGAL_EFFECTIVE_DATE` | e.g. `1 December 2026`. Change it whenever you change the terms. |
| `HOSTING_REGION` | Where your server/database run, e.g. `the United States (Oregon)`. |
| `TRUST_PROXY=1` | Set this on Render/Railway/Fly so bans use the visitor's real address, not the host's load balancer. |
| `PORT` | Set automatically by most hosts. |

## Database

With `DATABASE_URL` set, Afterhours creates its tables on first start
(`bans`, `reports`, `activity`, `settings`) — no migration step needed.

What is stored, and what isn't:

| Stored | Not stored |
|---|---|
| Active bans (nickname, reason, who, expiry) | Profiles of people who weren't reported |
| Reports, incl. the last 20 messages of the reported chat | Any other chat messages |
| Moderation activity log | Raw IP addresses — only a keyed hash, useless without the secret |

Expired bans are deleted automatically; closed reports and log entries after
`RETENTION_DAYS`. If the database goes down while running, the site keeps
working and logs the failed writes; if it's down at startup, the server refuses
to start rather than run without your bans.

Tests: `TEST_DATABASE_URL=postgres://… npm test` also runs the database tests
(including restarting the server and checking bans survive). CI does this
automatically.

## Terms of Service and Privacy Policy

Served at `/terms` and `/privacy` from `views/terms.html` and `views/privacy.html`,
with your details filled in from the settings above. Anything you haven't set
shows as a yellow **[set NAME]** on the page so it can't slip through.

The privacy policy describes exactly what the code does (what's kept in
memory, what's saved, for how long). **If you change how data is handled,
update `views/privacy.html` in the same change.** Both are plain-English drafts:
have a lawyer where you operate review them before launch.

Sign-up asks for three separate confirmations: 18+, agreeing to the terms, and
explicit consent to use "interested in / looking for" for matching (this can
reveal sexual orientation, which GDPR and similar laws treat as sensitive data).

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

## Hosting

Needs a host that supports WebSockets — **not** Netlify static/functions.

**Easiest: Render Blueprint.** The repo root has a `render.yaml`. On render.com
choose New → Blueprint → this repo. It creates the site and a Postgres
database, links them, and asks you for `MOD_PASSWORD`.

Note: Render's *free* Postgres is deleted after 30 days. Either upgrade it
(~$6/month) before then, or use a free database from Neon or Supabase and set
`DATABASE_URL` to its connection string (include `?sslmode=require`).

Railway and Fly.io also work: set the environment variables above, build
`npm ci`, start `npm start`.

## Before opening it to the public (operator based in NSW, Australia)

This is a working prototype. A real launch needs the following. **This is a
checklist, not legal advice** — get a lawyer who knows online safety and
privacy law to review it.

**Business basics**
1. **ABN** (free, abr.gov.au) and, if you trade as "Afterhours" or another
   name that isn't your own, **register the business name with ASIC**.
   A `.com.au` domain needs an ABN.
2. Fill in the legal-page settings: `OPERATOR_NAME` (your name or business,
   ideally with the ABN), a monitored `CONTACT_EMAIL`, `LEGAL_EFFECTIVE_DATE`.

**Online Safety Act (eSafety Commissioner)**
3. **Age assurance.** The registered online safety industry codes cover
   dating services, and eSafety's position is that self-declared ages (like
   our date-of-birth box) aren't effective. Several code measures for dating
   services depend on whether you use age assurance. Add a real provider
   before launch — e.g. ConnectID, Yoti, or Persona — and name it in `/privacy`.
4. **Read the codes that apply to you** in eSafety's *Online Safety Codes and
   Standards Regulatory Guidance* (Sept 2026) and the Basic Online Safety
   Expectations guidance. Most of what they ask — reporting tools, terms
   against illegal content, acting on reports, cooperating with police — is
   built in; check the dating-services measures line by line.
5. **Online Dating Industry Code** (australianonlinedatingcode.com.au). Voluntary
   today, but eSafety is reviewing it in 2026 and the government has said it
   may become mandatory. Aligning early is cheap: it expects published safety
   policies, in-app reporting, banning repeat offenders, support resources for
   people who've been harmed, and working with police.
6. **Child abuse material:** if you ever become aware of it, refer it to the
   AFP — report through the ACCCE (accce.gov.au/report). Under the Criminal
   Code, content hosts must refer details to the AFP within a reasonable time.

**Privacy Act 1988**
7. Businesses under $3M turnover are currently exempt, but the government has
   agreed in principle to remove that exemption (not yet legislated as of
   late 2026), and the statutory privacy tort applies regardless. The privacy
   policy is written to the Australian Privacy Principles so you're covered
   either way. You can also opt in to the Privacy Act voluntarily (OAIC "opt-in
   register") — a good trust signal for a site like this.
8. Data is hosted in **Singapore** (Render has no Australian region). That's
   allowed, and disclosed in `/privacy`. If you'd rather keep data onshore,
   Fly.io (Sydney region) plus a Neon or Supabase database in Sydney works too
   — update `HOSTING_REGION`.

**Running it safely**
9. **Human moderation** — someone checking `/mod/` regularly, and the
   `CONTACT_EMAIL` inbox for appeals.
10. **Individual moderator accounts** instead of one shared password, once you
    have more than a couple of moderators.
11. **No paid sex on the platform.** Sex work is decriminalised in NSW, but
    users are in other states and countries, and payments are the main vector
    for scams, sextortion and trafficking. Keep the selling filter and ban for it.
