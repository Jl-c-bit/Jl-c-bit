# GodMode weekly phone alerts

`weekly_alerts.py` checks SPY, EEM, XLE, BTC and ETH once a week and prints a short message.
A Claude scheduled task runs it every Monday (01:17 UTC), after both the stock week (Friday)
and the crypto week (Sunday) have closed, and sends the result as a push notification
through the Claude app.

**Alerts**
- **REGIME BUY / SELL**: the market switched to risk-on (back to 100%) or risk-off (cut to 50%).
  This is the part that cut losses in the backtests. It fires a few times a year.
- **ARROW BUY / SELL / GOD BUY / GOD SELL**: the indicator's chart arrows (weekly preset).
  In testing these did no better than chance.
- Crypto (BTC, ETH) was never backtested. Its regime uses US sector breadth plus its own volatility.

**Run it yourself**: put Alpha Vantage weekly CSVs in a folder (see the script's docstring for names), then
`python3 weekly_alerts.py <folder>`; add `--today 2020-03-02` to replay an earlier week.

Not financial advice.
