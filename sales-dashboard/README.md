# Jl-c-bit Sales Dashboard

A sales dashboard for Jl-c-bit's agency, built and hosted on [Floot](https://floot.com).
The app's source lives in the Floot project **Jl-c-bit Sales Dashboard**
(`1acb5b74-0dd0-4019-8d37-bef58b881ad8`); this folder only documents it.

## What it shows

- **KPIs** — revenue month to date (vs. all of last month), revenue year to date,
  open pipeline value and deal count, 90-day win rate, new leads in the last 30 days.
- **Monthly revenue** — trailing 12 months of closed-won revenue.
- **Deals in progress** — pipeline split by stage (qualified → proposal → negotiation)
  and a stage-filterable table with client, owner, expected close date and value.
- **Recent leads** — the 10 newest leads with source, status and estimated value.

## How it's built

| Piece | Floot item |
| --- | --- |
| Page | `pages/_index.tsx` |
| Data endpoint | `endpoints/dashboard_GET.ts` (one call returns everything above) |
| Query hook | `helpers/useDashboard.tsx` |
| Database | Postgres tables `deals` and `leads` |
| Design tokens | `base.css` — light and dark modes |

Revenue is the sum of `deals.value` where `stage = 'won'`, bucketed by `closed_at`.
The database is currently filled with sample data dated relative to the day it was loaded.
