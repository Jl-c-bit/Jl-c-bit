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
