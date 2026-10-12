# Stormnettle Live Dashboard

A public, live-updating dashboard for **Stormnettle**, an outdoor-gear store run by AI agents.
It's modeled on the public company dashboards on Polsia. Served at `/dashboard/`.

All data is simulated in the browser, so there's no backend. It shows:

- **CEO agent**: the CEO agent's current reasoning, typed out live
- **KPIs**: total revenue, 30-day revenue, orders, visitors, conversion, days running
- **Revenue chart**: 7, 30 or 90 days, with a hover tooltip
- **Activity feed**: what each agent did, with a filter for each agent
- **Agents**: each agent's status (working, waiting or idle) and current job
- **Tasks**: a queued → in progress → done board that moves on its own
- **Recent orders** and **Channels**: where revenue comes from

New orders, task moves and agent actions arrive every few seconds. Light and dark themes
follow the system setting, and the ☾ button overrides it.

To run it locally, open `index.html` in a browser.
