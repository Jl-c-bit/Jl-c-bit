# Stormnettle Live Dashboard

A public, live-updating dashboard for **Stormnettle**, an outdoor-gear store run by AI agents.
It's modeled on the public company dashboards on Polsia. Served at `/dashboard/`.

- **CEO agent**: the CEO agent's current reasoning, typed out live
- **KPIs**: revenue, 30-day revenue and orders (vs the prior 30 days), average order, customers, days selling
- **Revenue chart**: 7, 30 or 90 days, with a hover tooltip
- **Activity feed**: what each agent did, with a filter for each agent
- **Agents** and **Tasks**: who's working on what, and a queued → in progress → done board
- **Recent orders** and **Sales by country**

## Real sales data (Stripe)

`/dashboard/api/stats` (`connect-demo/netlify/functions/dashboard-stats.mjs`) reads succeeded
charges with the site's `STRIPE_SECRET_KEY`, the same key the shop uses. It sums them with
`stats.js` and caches the result for 5 minutes. The page asks it for data on load and every 5 minutes.
The badge in the header says **Stripe · live** or **Stripe · test mode**, matching the key.

- Refunds are subtracted, and failed or fully refunded charges are ignored.
- If charges come in more than one currency, only the most common one is counted.
- **Privacy:** the dashboard is public, so the endpoint returns only totals, dates, amounts,
  countries and charge descriptions. It never returns names, emails or card details (see `test/stats.test.js`).
- With no key set, or when the endpoint is unreachable (for example when you open `index.html` as
  a file), the page shows simulated demo sales and the badge says **Demo data**.

The agent activity, tasks and CEO thoughts are always simulated.

## Run locally

```sh
cd dashboard
npm test      # tests for the summary logic
npm start     # http://localhost:5175 (demo data; the Stripe endpoint runs on Netlify)
```
