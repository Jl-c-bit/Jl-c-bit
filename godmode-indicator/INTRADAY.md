# Using GodMode on 1, 5 and 15-minute futures charts

> **Untested.** Every backtest so far used weekly bars, where the BUY/SELL arrows did no better than chance.
> Short timeframes are noisier, and futures use leverage. Paper trade first (step 6) and track the results
> before risking real money. Not financial advice.

## What the Intraday preset changes
| Setting | Intraday preset |
|---|---|
| Trend filter | Session **VWAP** (buys only above it, sells only below it) instead of a moving average |
| Oversold / overbought | 30 / 70 |
| Zone memory | 3 bars |
| God-mode agreement | 5 of 7 readings |
| Market regime | Read from the **previous completed daily bar**, so a 1-minute wiggle can't flip it. It answers "is today a risk-on day?" |

The momentum score itself (7 readings) is unchanged.

## Setup (about 10 minutes)

1. **Get the script into TradingView.** Open the Pine Editor, paste the whole of `godmode.pine`, click
   **Add to chart**. If you get a red error, copy it and send it to Claude.
2. **Open a futures chart.** Search for **MES1!** (Micro S&P 500) or **MNQ1!** (Micro Nasdaq-100). Micros are
   one tenth the size of ES/NQ: about **$5 per S&P point** instead of $50.
3. **Pick the timeframe** at the top of the chart: 1m, 5m or 15m. 5m is a reasonable place to start; 1m is the noisiest.
4. **Switch on the preset.** Click the gear on the indicator → *Preset* → **Intraday (1-15 min, untested)**.
   Optional: *Require higher-timeframe agreement* with *Higher timeframe* = 60 (only trade with the hourly trend).
5. **Create the phone alerts.** In the TradingView phone app, sign in and allow notifications. Then on the chart:
   **Alert** (clock icon) → *Condition*: **GodMode Confluence Oscillator** → pick one of:
   - **GodMode Buy** / **GodMode Sell**: the arrows
   - **GodMode Strong Buy** / **GodMode Strong Sell**: the gold GOD arrows (rarer)
   - **Regime turned risk-off** / **risk-on**: the daily risk switch

   Set *Trigger* to **Once per bar close**, tick **Notify on app**, and save. Repeat for each alert you want.
   The free TradingView plan limits how many alerts you can keep active.
6. **Paper trade first.** In the Trading Panel at the bottom, connect **Paper Trading**. Take every signal on
   paper for a few weeks and write down entry, exit and result. If it doesn't make money on paper, it won't with real money.

## Things to know
- **Live data costs extra.** Free TradingView futures prices are delayed about 10 minutes, which is useless for
  day trading. Real-time needs the paid CME data add-on (check the current price under TradingView → Market data subscriptions).
- **Regime on intraday charts** uses the 9 sector ETFs and volatility from the previous day. It changes at most once a day.
- **Sessions:** VWAP resets each trading session. Signals near the open, while VWAP has little data, are less reliable.
- **Risk:** decide your stop-loss and position size before you enter. One MES contract moving 20 points is $100.
