# Tally

Aussie crypto tax estimator for 2026–27. Static site, no server, nothing leaves the browser.

- **Tax on my trades**: import an exchange CSV (CoinSpot, Swyftx, Independent Reserve, Binance and others) or add trades by hand. Sells are matched to buys first-in, first-out; only disposals from 1 Jul 2026 to 30 Jun 2027 are counted. Losses go against short-term gains first, then the 50% discount applies to what's left.
- **Sell now or wait?**: for one holding, compares selling today with selling once it qualifies for the discount, and shows how far the price could fall before waiting stops paying off.

Rates: 0% / 15% / 30% / 37% / 45% plus the 2% Medicare levy. The discount needs 12 months held, not counting the buy and sell days.

```
npm test     # logic tests (core.js)
npm start    # serve locally on :5174
```

Deployed at `/tally/` by the root `netlify.toml`. Estimate only, not tax advice.
