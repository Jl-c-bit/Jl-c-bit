# GodMode Confluence Oscillator: Backtest Report

_Generated 2026-11-05 by `backtest/report.py` from Alpha Vantage weekly data._

**Bottom line:** the momentum score has no consistent trading edge, on its own or as a filter. The volatility + breadth regime predicts *risk* rather than direction: sizing down to 50% in risk-off cut max drawdown versus an equal-average fixed exposure in 6 of 6 tests, but matched or beat its return in only 3 of 6.

## Data & method

| ETF | From | To | Weekly bars |
|---|---|---|---|
| SPY | 1999-11-12 | 2026-11-03 | 1409 |
| EEM | 2003-04-17 | 2026-11-03 | 1230 |
| XLE | 1999-11-12 | 2026-11-03 | 1409 |

- Split-adjusted: EEM 3:1 on 2005-06-10, EEM 3:1 on 2008-07-25, XLE 2:1 on 2025-12-05.
- Breadth uses the 9 original sector SPDRs: XLB, XLE, XLF, XLI, XLK, XLP, XLU, XLV, XLY.
- Signals decided on a weekly close, acted on next week. Dividends excluded, cash earns 0%, 0.05% cost per side.
- Train = 2003–2016, Test = 2017–2026. Anything tuned was tuned on Train only.
- 'Hit' = share of signals followed by a move in the signal's direction (up for buys, down for sells).

## 1. Signal forward returns

Original settings: trend EMA 200, zones 25/75, memory 5, 6/7 agree. Weekly preset: EMA 20, zones 35/65, memory 8, 5/7 agree (chosen on SPY Train, see section 2).

### SPY

| Period | Signal | Settings | N | Avg 4w | Avg 13w | Avg 26w | Hit 13w |
|---|---|---|---|---|---|---|---|
| Train | Baseline (all weeks) |  | 696 | +0.56% | +1.81% | +3.64% | 68% |
| Train | BUY | Original | 0 | - | - | - | - |
| Train | God-mode bull start | Original | 48 | -0.07% | +1.57% | +1.55% | 71% |
| Train | SELL | Original | 7 | +2.70% | +5.90% | +6.12% | 14% |
| Train | God-mode bear start | Original | 15 | +0.66% | +1.92% | +5.10% | 27% |
| Train | BUY | Weekly | 6 | -0.66% | +4.46% | +9.94% | 83% |
| Train | God-mode bull start | Weekly | 61 | +0.06% | +2.32% | +3.18% | 72% |
| Train | SELL | Weekly | 5 | -0.27% | +4.34% | +2.28% | 20% |
| Train | God-mode bear start | Weekly | 31 | +0.49% | +2.04% | +3.98% | 32% |
| Test | Baseline (all weeks) |  | 514 | +1.05% | +3.39% | +6.82% | 74% |
| Test | BUY | Original | 3 | +1.18% | +8.45% | +11.99% | 67% |
| Test | God-mode bull start | Original | 41 | +0.42% | +3.14% | +5.85% | 77% |
| Test | SELL | Original | 0 | - | - | - | - |
| Test | God-mode bear start | Original | 2 | +17.10% | +20.98% | +29.57% | 0% |
| Test | BUY | Weekly | 2 | +7.09% | +12.42% | +16.10% | 100% |
| Test | God-mode bull start | Weekly | 41 | +0.51% | +3.45% | +6.02% | 77% |
| Test | SELL | Weekly | 3 | +4.84% | +8.59% | +17.31% | 0% |
| Test | God-mode bear start | Weekly | 13 | -1.88% | +4.04% | +8.94% | 31% |

### EEM

| Period | Signal | Settings | N | Avg 4w | Avg 13w | Avg 26w | Hit 13w |
|---|---|---|---|---|---|---|---|
| Train | Baseline (all weeks) |  | 517 | +0.24% | +0.83% | +1.68% | 55% |
| Train | BUY | Original | 1 | -36.57% | -33.87% | -37.87% | 0% |
| Train | God-mode bull start | Original | 28 | +0.60% | +2.15% | -0.83% | 64% |
| Train | SELL | Original | 2 | +2.92% | +8.40% | +14.60% | 50% |
| Train | God-mode bear start | Original | 20 | +1.15% | +5.69% | +7.42% | 40% |
| Train | BUY | Weekly | 4 | +0.78% | -1.09% | -5.46% | 50% |
| Train | God-mode bull start | Weekly | 33 | +1.44% | +2.48% | +0.52% | 64% |
| Train | SELL | Weekly | 4 | +3.10% | +8.71% | +9.62% | 25% |
| Train | God-mode bear start | Weekly | 30 | +1.29% | +2.39% | +0.07% | 50% |
| Test | Baseline (all weeks) |  | 514 | +0.54% | +1.80% | +3.57% | 57% |
| Test | BUY | Original | 0 | - | - | - | - |
| Test | God-mode bull start | Original | 35 | +0.60% | +2.84% | +5.93% | 65% |
| Test | SELL | Original | 2 | -1.97% | -0.15% | +0.98% | 50% |
| Test | God-mode bear start | Original | 17 | -0.06% | +2.49% | +1.49% | 29% |
| Test | BUY | Weekly | 4 | +1.17% | +2.04% | -3.14% | 50% |
| Test | God-mode bull start | Weekly | 44 | +0.71% | +2.78% | +4.20% | 65% |
| Test | SELL | Weekly | 6 | +3.09% | +2.68% | +5.52% | 50% |
| Test | God-mode bear start | Weekly | 28 | +0.13% | +0.99% | -0.29% | 48% |

### XLE

| Period | Signal | Settings | N | Avg 4w | Avg 13w | Avg 26w | Hit 13w |
|---|---|---|---|---|---|---|---|
| Train | Baseline (all weeks) |  | 696 | +0.87% | +2.71% | +5.12% | 66% |
| Train | BUY | Original | 4 | -0.69% | +0.69% | +0.36% | 50% |
| Train | God-mode bull start | Original | 41 | +1.11% | +3.59% | +5.80% | 73% |
| Train | SELL | Original | 0 | - | - | - | - |
| Train | God-mode bear start | Original | 17 | +4.45% | +5.39% | +9.11% | 29% |
| Train | BUY | Weekly | 3 | -2.83% | +2.26% | +8.08% | 67% |
| Train | God-mode bull start | Weekly | 53 | +1.19% | +4.68% | +6.63% | 81% |
| Train | SELL | Weekly | 3 | -2.71% | -2.07% | +0.07% | 33% |
| Train | God-mode bear start | Weekly | 32 | +3.51% | +4.44% | +6.32% | 34% |
| Test | Baseline (all weeks) |  | 514 | +0.86% | +2.59% | +4.93% | 52% |
| Test | BUY | Original | 0 | - | - | - | - |
| Test | God-mode bull start | Original | 27 | +1.06% | +1.75% | +4.78% | 50% |
| Test | SELL | Original | 1 | -2.28% | +5.77% | -0.42% | 0% |
| Test | God-mode bear start | Original | 19 | +2.34% | +1.00% | +8.79% | 53% |
| Test | BUY | Weekly | 4 | +7.19% | +14.76% | +25.03% | 75% |
| Test | God-mode bull start | Weekly | 39 | +0.71% | +0.49% | +4.09% | 47% |
| Test | SELL | Weekly | 4 | -0.25% | +7.63% | +7.35% | 50% |
| Test | God-mode bear start | Weekly | 37 | +2.57% | +1.76% | +3.66% | 54% |

## 2. Weekly tuning (Train only) and out-of-sample check

Grid: trend EMA {20,30,40,50} × oversold {30,35,40} × overbought {60,65,70} × memory {3,5,8} × agree {5,6}. Objective: 13-week excess return over baseline of buy-side signals plus sell-side signals, each with ≥8 trades. Ties go to the first combination in that order.

| ETF | Best on Train | Buy-side edge Train | Buy-side edge Test | Sell-side edge Train | Sell-side edge Test |
|---|---|---|---|---|---|
| SPY | EMA20 35/65 mem8 5/7 | +0.95% (n=66) | +0.50% (n=41) | -0.55% (n=36) | -1.50% (n=16) |
| EEM | EMA40 30/60 mem3 5/7 | +1.46% (n=35) | +0.59% (n=44) | -1.40% (n=29) | +1.88% (n=29) |
| XLE | EMA50 30/60 mem3 6/7 | +1.70% (n=48) | +1.17% (n=31) | +0.52% (n=30) | -0.90% (n=38) |

Edge = average 13-week return after the signal minus the all-weeks average, sign-flipped for sells (positive = signal helped). The SPY result became the Weekly preset.

## 3. GodMode as a filter on other entries

Entries: **MA** 10/40-week SMA cross; **Donchian** close above prior 20-week high, exit below prior 10-week low; **Dip** close below the 20-week Bollinger band (2σ), exit back above the 20-week SMA. Filters checked at the entry bar only. 'Early exit' also exits when a god-mode bear starts.

| ETF | Entry | Fresh entries | Blocked: score>50 | Blocked: god-bear | Blocked: <5/7 bull |
|---|---|---|---|---|---|
| SPY | MA | 11 | 0 | 0 | 0 |
| SPY | Donchian | 148 | 0 | 0 | 0 |
| SPY | Dip | 26 | 26 | 26 | 26 |
| EEM | MA | 17 | 0 | 0 | 0 |
| EEM | Donchian | 88 | 0 | 0 | 0 |
| EEM | Dip | 26 | 26 | 26 | 26 |
| XLE | MA | 15 | 0 | 0 | 0 |
| XLE | Donchian | 96 | 0 | 0 | 0 |
| XLE | Dip | 26 | 26 | 26 | 26 |

| ETF | Entry | Period | Unfiltered CAGR / max DD | With entry filter (CAGR) | Early exit CAGR / max DD |
|---|---|---|---|---|---|
| SPY | MA | Train | +5.4% / -18% | identical to unfiltered | +4.1% / -19% |
| SPY | MA | Test | +8.4% / -32% | identical to unfiltered | +10.5% / -12% |
| SPY | Donchian | Train | +3.1% / -22% | identical to unfiltered | +3.3% / -20% |
| SPY | Donchian | Test | +5.7% / -19% | identical to unfiltered | +5.0% / -19% |
| SPY | Dip | Train | +0.1% / -47% | blocks every entry (0 trades) | 0 trades |
| SPY | Dip | Test | +4.6% / -17% | blocks every entry (0 trades) | 0 trades |
| EEM | MA | Train | +1.2% / -39% | identical to unfiltered | -1.0% / -42% |
| EEM | MA | Test | +1.2% / -42% | identical to unfiltered | +3.2% / -28% |
| EEM | Donchian | Train | -1.9% / -39% | identical to unfiltered | -1.8% / -38% |
| EEM | Donchian | Test | +3.4% / -24% | identical to unfiltered | +3.8% / -23% |
| EEM | Dip | Train | +2.1% / -36% | blocks every entry (0 trades) | 0 trades |
| EEM | Dip | Test | -1.9% / -35% | blocks every entry (0 trades) | 0 trades |
| XLE | MA | Train | +9.0% / -34% | identical to unfiltered | +6.5% / -30% |
| XLE | MA | Test | +7.9% / -33% | identical to unfiltered | +2.3% / -55% |
| XLE | Donchian | Train | +1.0% / -47% | identical to unfiltered | +1.3% / -45% |
| XLE | Donchian | Test | +0.6% / -39% | identical to unfiltered | +0.2% / -40% |
| XLE | Dip | Train | +1.9% / -27% | blocks every entry (0 trades) | 0 trades |
| XLE | Dip | Test | +3.4% / -54% | blocks every entry (0 trades) | 0 trades |

Trend entries happen when momentum is already bullish, so the filter never blocks them; dips happen when it is bearish, so it blocks all of them.

## 4. Volatility + breadth regime

Breadth = % of the 9 sector SPDRs above their 40-week SMA (weak below 50%). Volatility = 13-week stdev of weekly log returns, percentile vs the prior 156 weeks (high above 80). **Risk-on** = breadth not weak and volatility not high. Rules fixed before testing.

| ETF | Period | State | Weeks | Avg 13w | Up 13w | Stdev 13w |
|---|---|---|---|---|---|---|
| SPY | Train | All weeks | 726 | +2.08% | 70% | 7.5% |
| SPY | Train | Risk-on | 496 | +2.57% | 72% | 5.0% |
| SPY | Train | Risk-off | 230 | +1.01% | 64% | 11.0% |
| SPY | Train | Breadth weak | 169 | +1.84% | 69% | 12.1% |
| SPY | Train | Vol high | 155 | +0.53% | 58% | 9.2% |
| SPY | Test | All weeks | 514 | +3.39% | 76% | 7.1% |
| SPY | Test | Risk-on | 373 | +2.50% | 76% | 6.7% |
| SPY | Test | Risk-off | 141 | +5.75% | 77% | 7.5% |
| SPY | Test | Breadth weak | 105 | +6.52% | 77% | 8.2% |
| SPY | Test | Vol high | 91 | +6.38% | 79% | 7.8% |
| EEM | Train | All weeks | 547 | +1.30% | 57% | 12.9% |
| EEM | Train | Risk-on | 337 | +1.27% | 55% | 8.9% |
| EEM | Train | Risk-off | 210 | +1.35% | 60% | 17.5% |
| EEM | Train | Breadth weak | 139 | +2.37% | 63% | 19.8% |
| EEM | Train | Vol high | 153 | +4.65% | 66% | 14.5% |
| EEM | Test | All weeks | 514 | +1.80% | 59% | 8.6% |
| EEM | Test | Risk-on | 342 | +1.22% | 58% | 7.9% |
| EEM | Test | Risk-off | 172 | +2.99% | 59% | 9.8% |
| EEM | Test | Breadth weak | 105 | +4.28% | 66% | 10.3% |
| EEM | Test | Vol high | 99 | +4.10% | 57% | 10.6% |
| XLE | Train | All weeks | 726 | +2.77% | 66% | 11.0% |
| XLE | Train | Risk-on | 478 | +2.97% | 68% | 9.3% |
| XLE | Train | Risk-off | 248 | +2.39% | 63% | 13.8% |
| XLE | Train | Breadth weak | 169 | +2.30% | 65% | 15.6% |
| XLE | Train | Vol high | 172 | +4.08% | 63% | 11.1% |
| XLE | Test | All weeks | 514 | +2.59% | 53% | 14.2% |
| XLE | Test | Risk-on | 346 | +0.55% | 47% | 13.9% |
| XLE | Test | Risk-off | 168 | +6.84% | 65% | 13.9% |
| XLE | Test | Breadth weak | 105 | +4.16% | 57% | 12.0% |
| XLE | Test | Vol high | 111 | +9.30% | 76% | 14.8% |

Lower 'Stdev 13w' in risk-on = calmer outcomes. Higher 'Avg 13w' in risk-off (2017–26) = rebounds after sell-offs.

## 5. Position sizing by regime

Exposure 100% in risk-on and 50% / 25% / 0% in risk-off, compared with a **fixed exposure equal to the 100/50 rule's average** (the fair test: owning less always lowers swings) and with volatility targeting (exposure = trailing 3-year median vol ÷ current vol, capped at 100%).

|  | Regime 100/50: CAGR / max DD | Fixed same average: CAGR / max DD |
|---|---|---|
| SPY Train | +6.4% / -34% | +6.4% / -49% |
| SPY Test | +10.0% / -23% | +11.2% / -28% |
| EEM Train | +2.4% / -41% | +2.1% / -55% |
| EEM Test | +4.4% / -34% | +4.8% / -35% |
| XLE Train | +9.0% / -40% | +8.2% / -49% |
| XLE Test | +3.8% / -57% | +5.6% / -60% |

Smaller max drawdown than fixed exposure in **6 of 6**; equal or higher CAGR in **3 of 6**.

<details><summary>All sizing rules</summary>

| ETF | Period | Rule | Total | CAGR | Max DD | Return / vol | Avg exposure |
|---|---|---|---|---|---|---|---|
| SPY | Train | Buy & hold | +172% | +7.4% | -56% | 0.44 | 100% |
| SPY | Train | Regime 100/50 | +137% | +6.4% | -34% | 0.52 | 84% |
| SPY | Train | Regime 100/25 | +115% | +5.6% | -22% | 0.53 | 76% |
| SPY | Train | Regime 100/0 | +92% | +4.8% | -19% | 0.48 | 68% |
| SPY | Train | Fixed 84% | +139% | +6.4% | -49% | 0.45 | 84% |
| SPY | Train | Vol target | +165% | +7.2% | -39% | 0.57 | 88% |
| SPY | Test | Buy & hold | +232% | +12.9% | -32% | 0.75 | 100% |
| SPY | Test | Regime 100/50 | +157% | +10.0% | -23% | 0.79 | 86% |
| SPY | Test | Regime 100/25 | +123% | +8.4% | -20% | 0.74 | 79% |
| SPY | Test | Regime 100/0 | +91% | +6.8% | -21% | 0.62 | 73% |
| SPY | Test | Fixed 86% | +187% | +11.2% | -28% | 0.76 | 86% |
| SPY | Test | Vol target | +153% | +9.9% | -19% | 0.78 | 85% |
| EEM | Train | Buy & hold | +21% | +1.8% | -64% | 0.07 | 100% |
| EEM | Train | Regime 100/50 | +28% | +2.4% | -41% | 0.13 | 81% |
| EEM | Train | Regime 100/25 | +26% | +2.2% | -33% | 0.14 | 71% |
| EEM | Train | Regime 100/0 | +19% | +1.7% | -35% | 0.11 | 62% |
| EEM | Train | Fixed 81% | +24% | +2.1% | -55% | 0.09 | 81% |
| EEM | Train | Vol target | +5% | +0.4% | -54% | 0.02 | 87% |
| EEM | Test | Buy & hold | +70% | +5.5% | -41% | 0.29 | 100% |
| EEM | Test | Regime 100/50 | +53% | +4.4% | -34% | 0.29 | 83% |
| EEM | Test | Regime 100/25 | +43% | +3.7% | -30% | 0.26 | 75% |
| EEM | Test | Regime 100/0 | +32% | +2.8% | -31% | 0.21 | 67% |
| EEM | Test | Fixed 83% | +59% | +4.8% | -35% | 0.31 | 83% |
| EEM | Test | Vol target | +44% | +3.8% | -38% | 0.24 | 89% |
| XLE | Train | Buy & hold | +251% | +9.4% | -56% | 0.38 | 100% |
| XLE | Train | Regime 100/50 | +232% | +9.0% | -40% | 0.50 | 83% |
| XLE | Train | Regime 100/25 | +205% | +8.3% | -37% | 0.52 | 74% |
| XLE | Train | Regime 100/0 | +172% | +7.4% | -35% | 0.49 | 66% |
| XLE | Train | Fixed 83% | +202% | +8.2% | -49% | 0.40 | 83% |
| XLE | Train | Vol target | +208% | +8.4% | -46% | 0.43 | 86% |
| XLE | Test | Buy & hold | +76% | +5.9% | -67% | 0.20 | 100% |
| XLE | Test | Regime 100/50 | +44% | +3.8% | -57% | 0.17 | 84% |
| XLE | Test | Regime 100/25 | +25% | +2.2% | -54% | 0.11 | 75% |
| XLE | Test | Regime 100/0 | +4% | +0.4% | -52% | 0.02 | 67% |
| XLE | Test | Fixed 84% | +71% | +5.6% | -60% | 0.22 | 84% |
| XLE | Test | Vol target | +42% | +3.6% | -55% | 0.16 | 84% |

</details>

## 6. Fewer false alarms: regime variants

Uses **dividend-adjusted** prices, so buy & hold here includes dividends (unlike sections 1–5). Each rule holds 100% when risk-on and 50% when risk-off, and is compared with a fixed exposure equal to its own average. Rules were fixed before testing; nothing was tuned on either period.

- **Current regime**: as in section 4.
- **2-week confirmation**: switch only after two weeks in a row point the other way.
- **Hysteresis**: go risk-off when volatility passes the 80th percentile or breadth falls below 50%; come back only when volatility is below the 60th percentile and breadth is at least 55%.
- **12-month trend**: risk-on while the price is above its level 52 weeks earlier.
- **Regime + 12-month trend**: risk-on only when both agree.

| Rule | Switches per year (avg) | Smaller max DD than fixed | CAGR ≥ fixed |
|---|---|---|---|
| Current regime | 4.3 | 6 of 6 | 3 of 6 |
| 2-week confirmation | 2.5 | 6 of 6 | 4 of 6 |
| Hysteresis | 2.9 | 6 of 6 | 2 of 6 |
| 12-month trend | 2.7 | 6 of 6 | 3 of 6 |
| Regime + 12-month trend | 4.7 | 6 of 6 | 2 of 6 |

<details><summary>Every ETF and period</summary>

| ETF | Period | Rule | Switches | CAGR | Max DD | Fixed same avg: CAGR / max DD | Avg exposure |
|---|---|---|---|---|---|---|---|
| SPY | Train | Buy & hold (with dividends) | – | +9.6% | -55% | – | – |
| SPY | Train | Current regime | 57 (4.1/yr) | +8.1% | -33% | +8.2% / -48% | 84% |
| SPY | Train | 2-week confirmation | 35 (2.5/yr) | +8.8% | -33% | +8.2% / -48% | 84% |
| SPY | Train | Hysteresis | 43 (3.1/yr) | +7.1% | -33% | +7.9% / -46% | 80% |
| SPY | Train | 12-month trend | 25 (1.8/yr) | +8.8% | -35% | +8.8% / -51% | 91% |
| SPY | Train | Regime + 12-month trend | 63 (4.5/yr) | +6.8% | -33% | +8.0% / -47% | 82% |
| SPY | Test | Buy & hold (with dividends) | – | +14.9% | -32% | – | – |
| SPY | Test | Current regime | 40 (4.0/yr) | +11.8% | -22% | +12.9% / -28% | 87% |
| SPY | Test | 2-week confirmation | 24 (2.4/yr) | +12.5% | -22% | +13.0% / -28% | 87% |
| SPY | Test | Hysteresis | 26 (2.6/yr) | +11.7% | -22% | +12.2% / -26% | 81% |
| SPY | Test | 12-month trend | 12 (1.2/yr) | +13.6% | -26% | +13.9% / -30% | 94% |
| SPY | Test | Regime + 12-month trend | 36 (3.6/yr) | +11.9% | -22% | +12.7% / -28% | 85% |
| EEM | Train | Buy & hold (with dividends) | – | +3.9% | -63% | – | – |
| EEM | Train | Current regime | 41 (3.9/yr) | +4.1% | -41% | +3.7% / -54% | 81% |
| EEM | Train | 2-week confirmation | 23 (2.2/yr) | +4.0% | -37% | +3.7% / -54% | 81% |
| EEM | Train | Hysteresis | 29 (2.8/yr) | +2.7% | -41% | +3.7% / -53% | 78% |
| EEM | Train | 12-month trend | 42 (4.0/yr) | +3.6% | -45% | +3.7% / -54% | 80% |
| EEM | Train | Regime + 12-month trend | 55 (5.2/yr) | +2.9% | -41% | +3.5% / -49% | 71% |
| EEM | Test | Buy & hold (with dividends) | – | +7.9% | -39% | – | – |
| EEM | Test | Current regime | 48 (4.9/yr) | +6.9% | -28% | +6.8% / -34% | 83% |
| EEM | Test | 2-week confirmation | 24 (2.4/yr) | +7.0% | -29% | +6.8% / -34% | 84% |
| EEM | Test | Hysteresis | 36 (3.6/yr) | +6.7% | -32% | +6.5% / -32% | 79% |
| EEM | Test | 12-month trend | 20 (2.0/yr) | +8.0% | -30% | +6.8% / -34% | 84% |
| EEM | Test | Regime + 12-month trend | 40 (4.0/yr) | +7.3% | -30% | +6.3% / -31% | 76% |
| XLE | Train | Buy & hold (with dividends) | – | +11.4% | -56% | – | – |
| XLE | Train | Current regime | 55 (3.9/yr) | +10.4% | -39% | +9.9% / -48% | 83% |
| XLE | Train | 2-week confirmation | 33 (2.4/yr) | +11.3% | -36% | +9.9% / -48% | 83% |
| XLE | Train | Hysteresis | 29 (2.1/yr) | +10.7% | -38% | +9.4% / -46% | 78% |
| XLE | Train | 12-month trend | 23 (1.6/yr) | +12.0% | -40% | +10.2% / -50% | 87% |
| XLE | Train | Regime + 12-month trend | 59 (4.2/yr) | +10.5% | -33% | +9.3% / -46% | 77% |
| XLE | Test | Buy & hold (with dividends) | – | +9.7% | -64% | – | – |
| XLE | Test | Current regime | 51 (5.2/yr) | +6.5% | -54% | +8.8% / -57% | 84% |
| XLE | Test | 2-week confirmation | 28 (2.8/yr) | +5.8% | -54% | +8.8% / -57% | 84% |
| XLE | Test | Hysteresis | 31 (3.1/yr) | +5.6% | -53% | +8.4% / -54% | 78% |
| XLE | Test | 12-month trend | 56 (5.7/yr) | +7.5% | -46% | +8.7% / -56% | 83% |
| XLE | Test | Regime + 12-month trend | 65 (6.6/yr) | +6.4% | -43% | +8.1% / -52% | 75% |

</details>

## 7. Latest readings

| ETF | Week | Close | Score | Direction | Agreement | vs 20w EMA | Vol pct | Breadth | Regime | Exposure |
|---|---|---|---|---|---|---|---|---|---|---|
| SPY | 2026-11-03 | 754.35 | 50.6 | falling | 2/7 bull | below | 1 | 78% | RISK-ON | 100% |
| EEM | 2026-11-03 | 61.10 | 31.0 | falling | 1/7 bull | below | 38 | 78% | RISK-ON | 100% |
| XLE | 2026-11-03 | 66.68 | 74.2 | rising | 7/7 bull | above | 66 | 78% | RISK-ON | 100% |

## Caveats

- Weekly bars only; three ETFs, one of which (SPY) mostly rose.
- The sizing result leans on one slow bear market (2008).
- Dividends excluded (understates buy & hold, most for EEM and XLE); cash assumed to earn 0%.
- The Python port follows the Pine script's formulas; small differences in indicator warm-up are possible.
- Not financial advice.
