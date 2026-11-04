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

### As a filter on other entries
Tested on a 10/40-week MA crossover, a 20/10-week Donchian breakout and a Bollinger dip-buy, on SPY, EEM and XLE.
- **Entry filter = no effect on trend entries.** At every MA-cross and breakout entry the score was already
  >50, ≥5/7 bullish and not in god-mode bear, so the filter never blocked a trade. It measures the same thing.
- **Entry filter = blocks every dip-buy.** Oversold entries are by definition bearish momentum.
- **Early exit on god-mode bear:** helped the MA system in 2 of 6 cases (SPY and EEM 2017–26), hurt in 4
  (badly on XLE). Inconsistent.

## Market regime: volatility + breadth
Two new readings that look at things the momentum score doesn't:
- **Volatility**: how jumpy the last 13 bars were vs. the last 156 (percentile). Above 80 = HIGH.
  Source: this chart's own price, or a volatility index such as `TVC:VIX`.
- **Breadth**: % of the 9 original sector SPDRs (XLB XLE XLF XLI XLK XLP XLU XLV XLY) above their
  40-bar average, or any 0–100 breadth symbol such as `INDEX:S5TH`. Below 50% = weak.
- **Regime** = RISK-ON when volatility isn't high and breadth isn't weak. Shown as a strip at the top of
  the pane, in the dashboard, and as alerts. Lengths are in weeks and auto-scale ×5 on daily/intraday charts.
- Optional: *Only allow BUY signals in risk-on regime* (off by default; see below).

Backtest (weekly, rules fixed in advance):
- Unlike the momentum filters, the regime **does** disagree with trend entries (blocked 2–4 of 12–18 MA entries).
- It mainly predicts **risk, not direction**. SPY 2003–16: 13-week returns in risk-on weeks varied half as
  much (st. dev. 5.0% vs 11.0%). But in 2017–26, risk-off weeks were followed by *higher* returns on all
  three ETFs (rebounds after sell-offs).
- Holding only in risk-on cut the worst drawdown everywhere (SPY -56%→-19%, EEM -64%→-35%, XLE -56%→-35%
  in 2003–16) but gave up return everywhere except EEM 2003–16, and badly on XLE 2017–26 (+4% vs +76%).

### Position sizing by regime
Exposure 100% in risk-on, 50% in risk-off, vs. a **fixed** exposure with the same average (~84%) — the fair
comparison, because owning less always means smaller swings.

| | Regime 100/50 CAGR / max DD | Fixed same-avg CAGR / max DD |
|---|---|---|
| SPY 2003–16 | +6.4% / -34% | +6.4% / -49% |
| SPY 2017–26 | +10.0% / -23% | +11.2% / -28% |
| EEM 2003–16 | +2.4% / -41% | +2.1% / -55% |
| EEM 2017–26 | +4.4% / -34% | +4.8% / -35% |
| XLE 2003–16 | +9.0% / -40% | +8.2% / -49% |
| XLE 2017–26 | +3.8% / -57% | +5.6% / -60% |

- Smaller max drawdown than fixed exposure in **6 of 6**; equal or higher return in **3 of 6**.
- The big wins came from the slow 2008 bear market; in 2017–26 (fast V-shaped crashes like 2020) it lagged.
- 100/50 beat going fully to cash (100/0) on return in every test. Cash assumed to earn 0%.
- The dashboard shows a **suggested exposure** row (risk-off level is an input, default 50%).

Treat it as a dashboard of momentum conditions, not a standalone trading system.

## Full backtest report
All tests live in one script, `backtest/report.py`, which writes **[`backtest/REPORT.md`](backtest/REPORT.md)**.
To re-run: save Alpha Vantage `TIME_SERIES_WEEKLY` CSVs (csv format) into `backtest/` as `spy_weekly.csv`,
`eem_weekly.csv`, `xle_weekly.csv` and the 9 sector ETFs `xlb_weekly.csv` … `xly_weekly.csv`, then
`cd backtest && python3 report.py` (needs pandas and numpy).
Share splits are back-adjusted automatically; dividends are not included.
