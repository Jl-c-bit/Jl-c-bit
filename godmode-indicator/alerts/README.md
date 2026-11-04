# GodMode weekly phone alerts

`weekly_alerts.py` checks SPY, QQQ, AAPL, MSFT, NVDA, TSLA, AMZN and 7 crypto coins (BTC, ETH, SOL, XRP, BNB, DOGE, ADA) once a week and prints a short message.
A Claude scheduled task runs it every Monday (01:17 UTC), after both the stock week (Friday)
and the crypto week (Sunday) have closed, and sends the result as a push notification
through the Claude app.

**Alerts**
- **REGIME BUY / SELL**: the market switched to risk-on (back to 100%) or risk-off (cut to 50%).
  This is the part that cut losses in the backtests. It fires a few times a year.
- **ARROW BUY / SELL / GOD BUY / GOD SELL**: the indicator's chart arrows (weekly preset).
  In testing these did no better than chance.
- Only SPY was backtested; QQQ, the individual stocks and all crypto are labelled untested.
- Crypto was never backtested. Its regime uses US sector breadth plus the coin's own volatility.
- A coin with under ~3.5 years of weekly history shows "regime n/a"; one whose data could not be fetched is listed as "no data".

**Add or remove a stock or coin**: edit `STOCKS` or `CRYPTO` in `weekly_alerts.py`. The weekly run fetches whatever
`python3 weekly_alerts.py --symbols` lists. Each symbol is one Alpha Vantage request; the free plan allows
25 a day and the default list uses 23 (7 stocks/ETFs, 9 sector ETFs for breadth, 7 coins).

**Run it yourself**: put Alpha Vantage weekly CSVs in a folder (see the script's docstring for names), then
`python3 weekly_alerts.py <folder>`; add `--today 2020-03-02` to replay an earlier week.

Not financial advice.
