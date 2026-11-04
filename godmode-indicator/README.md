# GodMode Confluence Oscillator (TradingView / Pine Script v6)

One 0–100 oscillator built from 7 independent readings: RSI, MFI, Stochastic,
CCI, Williams %R, TSI, and a trend channel (distance from EMA in ATRs). It counts
how many of them agree and flags high-confluence moments.

## Install
1. TradingView → Pine Editor → New → paste `godmode.pine` → **Add to chart**.
2. Alerts: Create Alert → Condition: *GodMode Confluence Oscillator* → pick a signal.

## Reading it
| Signal | Meaning |
|---|---|
| **BUY / SELL** (green/red label) | Score crosses its signal line after a recent visit to oversold/overbought, with trend filter agreeing |
| **GOD BUY / GOD SELL** (gold label) | Same, but from the *extreme* zone (≤12 / ≥88) |
| ◆ gold diamond / shaded pane | God-mode alignment: ≥6 of 7 components agree and momentum is rising (bull) or falling (bear) |
| ● circles + lines in pane | Regular divergence between price and score |
| Dashboard | Live value of every component, alignment count, trend, ADX, HTF score |

Signals confirm on bar close, and the higher-timeframe filter uses the last
*closed* HTF bar, so nothing repaints.

## Tuning
- Default trend filter: only buys above the 200 EMA, only sells below it. Turn it off for range-bound markets.
- Turn on **ADX** to skip choppy markets, **HTF** to trade only with the bigger timeframe.
- Lower *components that must agree* (default 6) to get more god-mode alignments.

Not financial advice. Backtest on your own markets before trading real money.

## Weekly preset & backtest (SPY, Alpha Vantage weekly data)
Pick **Preset → Weekly (tuned on SPY)** on weekly charts: trend EMA 20, oversold 35,
overbought 65, zone memory 8 bars, 5 of 7 must agree. Settings were chosen on
2003–2016 only and checked on 2017–2026 (data the tuning never saw).

What the test showed (13-week forward returns vs. holding SPY any week):
- Buy-side signals roughly match buy-and-hold: no real edge. BUY signals look strong but fired only 8 times in 23 years.
- Sell signals do **not** work as shorts on SPY (it mostly went up).
- Most useful as a **risk filter**: holding SPY but sitting in cash while god-mode BEAR is active
  cut the worst drawdown from -32% to -25% in 2017–2026, for ~3 points less total return (+223% vs +232%).
  In 2003–2016 it cut the drawdown from -56% to -39% but gave up more return (+82% vs +121%).

### Cross-check on EEM and XLE (same SPY weekly preset, no re-tuning)
EEM (emerging markets) and XLE (energy) spent long stretches going nowhere or crashing, so they
test the indicator outside a steady uptrend. Result: **no consistent edge**.
- God-mode bull starts ≈ buying any random week on all three ETFs.
- SELL / god-mode bear signals were right less than half the time on all three.
- The "sit in cash during god-mode bear" filter helped on SPY and on EEM 2007–2016, but hurt on
  EEM 2017–2026 (+46% vs +70%) and badly on XLE (+57% vs +207%; +25% vs +76%) with little
  drawdown relief: in choppy, mean-reverting markets it sells near lows and buys back higher.
- Settings re-tuned per ETF on 2003–2016 didn't hold up on 2017–2026 either.

Treat it as a dashboard of momentum conditions, not a standalone trading system.

Re-run: save Alpha Vantage `TIME_SERIES_WEEKLY` CSV for SPY as `backtest/spy_weekly.csv`, then
`cd backtest && python3 retune.py spy_weekly.csv` (same for `eem_weekly.csv`, `xle_weekly.csv`) (needs pandas).
Share splits are back-adjusted automatically; dividends are not included.
