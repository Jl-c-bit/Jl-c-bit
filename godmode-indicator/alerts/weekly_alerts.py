"""Weekly GodMode alerts: prints a short phone-friendly message.

    python3 weekly_alerts.py DATA_DIR [--today YYYY-MM-DD]
    python3 weekly_alerts.py --symbols      # list what to fetch

To add or remove a stock or coin, edit STOCKS or CRYPTO below; the weekly run reads the list from --symbols.

DATA_DIR must hold Alpha Vantage weekly CSVs named <symbol>_weekly.csv
(columns timestamp,open,high,low,close,volume):
    spy qqq aapl msft nvda tsla amzn   stocks/ETFs (TIME_SERIES_WEEKLY)
    btc eth sol xrp bnb doge ada   crypto (DIGITAL_CURRENCY_WEEKLY, market USD)
    xlb xlf xli xlk xlp xlu xlv xly (+ xle)   sector ETFs for breadth

Only completed weeks are used: bars dated in the current week (Mon-Sun) are dropped.
--today lets you replay an earlier week.
Two kinds of alert, both judged on the latest completed week vs the one before:
  REGIME  risk-on/off switch (the tested part). Turned risk-on = BUY back to 100%;
          turned risk-off = SELL down to 50%.
  ARROWS  the indicator's BUY / SELL / GOD BUY / GOD SELL arrows with the Weekly
          preset. In testing these did no better than chance.
Everything except SPY is untested (the backtests covered SPY, EEM and XLE only).
Not financial advice.
"""
import os
import sys
from datetime import date, timedelta

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backtest'))
import report  # noqa: E402

STOCKS = ['spy', 'qqq', 'aapl', 'msft', 'nvda', 'tsla', 'amzn']
TESTED = {'spy', 'eem', 'xle'}                   # symbols the backtests covered
CRYPTO = ['btc', 'eth', 'sol', 'xrp', 'bnb', 'doge', 'ada']
BREADTH = ['xlb', 'xle', 'xlf', 'xli', 'xlk', 'xlp', 'xlu', 'xlv', 'xly']
P = report.WEEKLY
EXT_OS, EXT_OB = 12, 88                           # extreme zones, as in the Pine script


def completed(df, today):
    """Keep only weeks that finished before the current week (Monday 00:00) began."""
    monday = today - timedelta(days=today.weekday())
    return df[df.timestamp.dt.date < monday].reset_index(drop=True)


def analyse(sym, today):
    base = dict(sym=sym.upper(), untested=sym not in TESTED, crypto=sym in CRYPTO, alerts=[], week='-', breadth=np.nan)
    if not os.path.exists(os.path.join(report.DATA_DIR, f'{sym}_weekly.csv')):
        return dict(base, status='no data this week (fetch failed)')
    df = completed(report.load(sym, adjust_splits=sym not in CRYPTO), today)
    if len(df) < 60:
        return dict(base, week=df.timestamp.iloc[-1].date() if len(df) else '-',
                    status=f'not enough history ({len(df)} weeks)')
    c, dates = df.close, df.timestamp
    ind = report.indicators(df)
    S = report.signals(c, ind, {}, P['trend'], P['os'], P['ob'], P['memo'], P['agree'])
    score = ind['score']
    god_buy = S['BUY'] & (score.rolling(P['memo']).min() <= EXT_OS)
    god_sell = S['SELL'] & (score.rolling(P['memo']).max() >= EXT_OB)

    breadth = report.breadth_series(dates)[0]
    vol = np.log(c / c.shift()).rolling(13).std() * np.sqrt(52) * 100
    volpct = vol.rolling(157).apply(lambda x: (x[:-1] < x[-1]).mean() * 100, raw=True)
    on = (breadth >= 50) & (volpct <= 80)

    i = len(df) - 1
    alerts = []
    has_regime = not (np.isnan(volpct[i]) or np.isnan(volpct[i - 1]))  # needs ~3.5 years of history
    if not has_regime:
        pass
    elif on[i] and not on[i - 1]:
        alerts.append("REGIME BUY: turned risk-on, back to 100%")
    elif not on[i] and on[i - 1]:
        alerts.append("REGIME SELL: turned risk-off, cut to 50%")
    for name, mask in (('GOD BUY', god_buy), ('BUY', S['BUY'] & ~god_buy),
                       ('GOD SELL', god_sell), ('SELL', S['SELL'] & ~god_sell)):
        if mask[i]:
            alerts.append(f"ARROW {name}")
    regime = ('RISK-ON 100%' if on[i] else 'RISK-OFF 50%') if has_regime else 'regime n/a (short history)'
    status = (f"{regime} · score {score[i]:.0f} "
              f"{'rising' if score[i] > ind['sig'][i] else 'falling'} · close {c[i]:,.2f}")
    return dict(base, week=dates[i].date(), alerts=alerts, status=status, breadth=breadth[i])


def main():
    if '--symbols' in sys.argv:
        print('TIME_SERIES_WEEKLY: ' + ' '.join(s.upper() for s in dict.fromkeys(STOCKS + BREADTH)))
        print('DIGITAL_CURRENCY_WEEKLY (market USD): ' + ' '.join(s.upper() for s in CRYPTO))
        return
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    report.DATA_DIR = os.path.abspath(sys.argv[1])
    today = date.fromisoformat(sys.argv[sys.argv.index('--today') + 1]) if '--today' in sys.argv else date.today()
    results = [analyse(s, today) for s in STOCKS + CRYPTO]

    fired = [r for r in results if r['alerts']]
    if fired:
        head = ' | '.join(f"{r['sym']}: {', '.join(a.split(':')[0] for a in r['alerts'])}" for r in fired)
    else:
        head = 'No new signals this week'
    missing = [r['sym'] for r in results if r['week'] == '-']
    if missing:
        head += f" (no data: {', '.join(missing)})"
    lines = [f"GodMode weekly: {head}", '']
    for r in results:
        tag = ' (crypto, untested)' if r['crypto'] else ' (untested)' if r['untested'] else ''
        lines.append(f"{r['sym']}{tag}" + (f", week of {r['week']}" if r['week'] != '-' else ''))
        lines += [f"  -> {a}" for a in r['alerts']]
        lines.append(f"  {r['status']}")
    br = next((r['breadth'] for r in results if not np.isnan(r['breadth'])), np.nan)
    lines += ['', f"US breadth {br:.0f}% of sectors above trend." if not np.isnan(br) else "US breadth unavailable.",
              "Regime alerts are the tested part; arrows did no better than chance in testing. Not financial advice."]
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
