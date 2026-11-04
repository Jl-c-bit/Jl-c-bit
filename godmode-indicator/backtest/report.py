"""GodMode Confluence Oscillator: full backtest report.

Runs every test on weekly data and writes REPORT.md next to this script.

    python3 report.py            # needs pandas + numpy

Input CSVs (Alpha Vantage TIME_SERIES_WEEKLY, csv format) in this folder:
    spy_weekly.csv eem_weekly.csv xle_weekly.csv                     traded ETFs
    xlb xle xlf xli xlk xlp xlu xlv xly  (_weekly.csv)               breadth

Conventions used throughout:
- Signals are decided on a weekly close and acted on the next week.
- Forward returns exclude dividends; cash earns 0%; costs 0.05% per side.
- Share splits are back-adjusted (free Alpha Vantage data is unadjusted).
- "Train" = 2003-2016, "Test" = 2017-2026. Anything tuned is tuned on Train only.
"""
import itertools
import os
from datetime import date

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ETFS = ['spy', 'eem', 'xle']
SECTORS = ['xlb', 'xle', 'xlf', 'xli', 'xlk', 'xlp', 'xlu', 'xlv', 'xly']
SPLIT_DATE = '2017-01-01'
COST = 0.0005
H = (4, 13, 26)                                   # forward horizons in weeks
ORIGINAL = dict(trend=200, os=25, ob=75, memo=5, agree=6)
WEEKLY = dict(trend=20, os=35, ob=65, memo=8, agree=5)


# ───────────────────────────── Data ─────────────────────────────
def load(sym, log=None):
    df = pd.read_csv(os.path.join(HERE, f'{sym}_weekly.csv'), parse_dates=['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)
    # A week whose close is ~2x/3x/4x below the previous close is treated as a split.
    for i in range(1, len(df)):
        ratio = df.close[i - 1] / df.close[i]
        k = round(ratio)
        if k >= 2 and abs(ratio - k) / k < 0.08:
            for col in ('open', 'high', 'low', 'close'):
                df.loc[:i - 1, col] /= k
            df.loc[:i - 1, 'volume'] *= k
            for col in ('open', 'high'):          # split week mixes pre/post prices
                if df.loc[i, col] > df.close[i] * 1.5:
                    df.loc[i, col] /= k
            if log is not None:
                log.append(f"{sym.upper()} {k}:1 on {df.timestamp[i].date()}")
    return df


# ─────────────────────── Pine-equivalent indicators ───────────────────────
def _seeded(x, n, step):
    """Pine-style recursive average seeded with the SMA of the first n values."""
    out = np.full(len(x), np.nan)
    prev, buf = np.nan, []
    for i, v in enumerate(pd.Series(x, dtype=float).values):
        if np.isnan(v):
            continue
        if np.isnan(prev):
            buf.append(v)
            if len(buf) == n:
                prev = out[i] = np.mean(buf)
        else:
            prev = out[i] = step(prev, v)
    return pd.Series(out)


def ema(x, n):
    a = 2 / (n + 1)
    return _seeded(x, n, lambda p, v: a * v + (1 - a) * p)


def rma(x, n):
    return _seeded(x, n, lambda p, v: (v + (n - 1) * p) / n)


def sma(x, n):
    return pd.Series(x).rolling(n).mean()


def indicators(df):
    o, h, l, c, v = df.open, df.high, df.low, df.close, df.volume
    hlc3 = (h + l + c) / 3
    squash = lambda x, k: 50 + 50 * (x / (x.abs() + k))
    d = c.diff()
    rsi = 100 - 100 / (1 + rma(d.clip(lower=0), 14) / rma((-d).clip(lower=0), 14))
    ch = hlc3.diff()
    mfi = 100 - 100 / (1 + (v * np.where(ch > 0, hlc3, 0)).rolling(14).sum()
                       / (v * np.where(ch < 0, hlc3, 0)).rolling(14).sum())
    stoch = 100 * (c - l.rolling(14).min()) / (h.rolling(14).max() - l.rolling(14).min())
    m = hlc3.rolling(20).mean()
    md = hlc3.rolling(20).apply(lambda w: np.mean(np.abs(w - w.mean())), raw=True)
    cci = (hlc3 - m) / (0.015 * md)
    wpr = 100 * (c - h.rolling(14).max()) / (h.rolling(14).max() - l.rolling(14).min())
    pc = c.diff()
    tsi = ema(ema(pc, 25), 13) / ema(ema(pc.abs(), 25), 13)
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    tr.iloc[0] = h.iloc[0] - l.iloc[0]
    comp = pd.DataFrame({
        'RSI': rsi, 'MFI': mfi, 'Stoch': sma(stoch, 3), 'CCI': squash(cci, 100),
        'W%R': 100 + wpr, 'TSI': 50 + 50 * tsi, 'Trend': squash((c - ema(c, 21)) / rma(tr, 21), 1.0)})
    score = ema(comp.mean(axis=1, skipna=False), 3)
    return dict(comp=comp, score=score, sig=sma(score, 5),
                bull=(comp > 50).sum(axis=1), bear=(comp < 50).sum(axis=1))


def signals(c, ind, ema_cache, trend, os_, ob, memo, agree):
    score, sig, bull, bear = ind['score'], ind['sig'], ind['bull'], ind['bear']
    t = ema_cache.setdefault(trend, ema(c, trend))
    up, dn = c > t, c < t
    cu = (score > sig) & (score.shift() <= sig.shift())
    cd = (score < sig) & (score.shift() >= sig.shift())
    gb = (bull >= agree) & (score > 50) & (score > sig) & up
    gs = (bear >= agree) & (score < 50) & (score < sig) & dn
    return dict(BUY=cu & (score.rolling(memo).min() <= os_) & up,
                SELL=cd & (score.rolling(memo).max() >= ob) & dn,
                **{'God-mode bull start': gb & ~gb.shift(fill_value=False),
                   'God-mode bear start': gs & ~gs.shift(fill_value=False)},
                _godBear=gs)


def breadth_series(dates):
    cols = []
    for s in SECTORS:
        d = load(s)
        sm = d.close.rolling(40)
        cols.append(pd.Series((d.close > sm.mean()).where(sm.count() == 40).values, index=d.timestamp))
    wide = pd.concat(cols, axis=1, keys=[s.upper() for s in SECTORS])
    return pd.Series((wide.mean(axis=1) * 100).reindex(dates).values), wide


# ───────────────────────────── Helpers ─────────────────────────────
def pct(x, d=2, sign=True):
    return '-' if x is None or pd.isna(x) else (f"{x:+.{d}f}%" if sign else f"{x:.{d}f}%")


def md_table(rows, cols):
    out = ['| ' + ' | '.join(cols) + ' |', '|' + '|'.join('---' for _ in cols) + '|']
    out += ['| ' + ' | '.join(str(v) for v in r) + ' |' for r in rows]
    return '\n'.join(out)


def run_position(entry, exit_, valid, allow=None, force_exit=None):
    """Long/flat state machine. allow: entry permitted; force_exit: extra exit condition."""
    pos = np.zeros(len(entry), bool)
    inpos = False
    for i in range(len(entry)):
        if not valid[i]:
            inpos = False
            continue
        if inpos and (exit_[i] or (force_exit is not None and force_exit[i])):
            inpos = False
        elif not inpos and entry[i] and (allow is None or allow[i]):
            inpos = True
        pos[i] = inpos
    return pd.Series(pos)


def equity_stats(weights, ret, per):
    w = pd.Series(weights, dtype=float).fillna(0).clip(0, 1)
    turn = w.diff().abs().fillna(0)
    x = (w * ret - turn * COST)[per].fillna(0)
    eq = (1 + x).cumprod()
    yrs = len(x) / 52
    cagr = eq.iloc[-1] ** (1 / yrs) - 1
    dd = (eq / eq.cummax() - 1).min()
    sd = x.std() * np.sqrt(52)
    return dict(total=(eq.iloc[-1] - 1) * 100, cagr=cagr * 100, vol=sd * 100, dd=dd * 100,
                rr=cagr / sd if sd else np.nan, exp=w[per].mean() * 100)


# ───────────────────────────── Report ─────────────────────────────
def main():
    splits = []
    R = {}                                        # per-ETF intermediate results
    for sym in ETFS:
        df = load(sym, splits)
        c, dates = df.close, df.timestamp
        ind = indicators(df)
        ec = {}
        fwd = {k: (c.shift(-k) / c - 1) * 100 for k in H}
        ret = c.pct_change().shift(-1)
        R[sym] = dict(df=df, c=c, dates=dates, ind=ind, ec=ec, fwd=fwd, ret=ret,
                      breadth=breadth_series(dates)[0])

    L = []
    w = L.append
    w("# GodMode Confluence Oscillator: Backtest Report\n")
    w(f"_Generated {date.today()} by `backtest/report.py` from Alpha Vantage weekly data._\n")
    w("**Bottom line:** the momentum score has no consistent trading edge, on its own or as a filter. "
      "The volatility + breadth regime predicts *risk* rather than direction: sizing down to 50% in "
      "risk-off cut max drawdown versus an equal-average fixed exposure in 6 of 6 tests, but matched "
      "or beat its return in only 3 of 6.\n")
    w("## Data & method\n")
    rows = []
    for sym in ETFS:
        d = R[sym]
        rows.append([sym.upper(), d['dates'].iloc[0].date(), d['dates'].iloc[-1].date(), len(d['df'])])
    w(md_table(rows, ['ETF', 'From', 'To', 'Weekly bars']))
    w(f"\n- Split-adjusted: {', '.join(splits) if splits else 'none'}.")
    w("- Breadth uses the 9 original sector SPDRs: " + ', '.join(s.upper() for s in SECTORS) + ".")
    w("- Signals decided on a weekly close, acted on next week. Dividends excluded, cash earns 0%, 0.05% cost per side.")
    w("- Train = 2003–2016, Test = 2017–2026. Anything tuned was tuned on Train only.")
    w("- 'Hit' = share of signals followed by a move in the signal's direction (up for buys, down for sells).\n")

    # ── 1. Signals: original vs weekly preset ──
    w("## 1. Signal forward returns\n")
    w(f"Original settings: trend EMA {ORIGINAL['trend']}, zones {ORIGINAL['os']}/{ORIGINAL['ob']}, "
      f"memory {ORIGINAL['memo']}, {ORIGINAL['agree']}/7 agree. "
      f"Weekly preset: EMA {WEEKLY['trend']}, zones {WEEKLY['os']}/{WEEKLY['ob']}, memory {WEEKLY['memo']}, "
      f"{WEEKLY['agree']}/7 agree (chosen on SPY Train, see section 2).\n")
    for sym in ETFS:
        d = R[sym]
        c, dates, fwd = d['c'], d['dates'], d['fwd']
        valid = ema(c, 200).notna()
        periods = {'Train': valid & (dates < SPLIT_DATE), 'Test': valid & (dates >= SPLIT_DATE)}
        d['sig_periods'] = periods
        w(f"### {sym.upper()}\n")
        rows = []
        for setname, P in (('Original', ORIGINAL), ('Weekly', WEEKLY)):
            S = signals(c, d['ind'], d['ec'], P['trend'], P['os'], P['ob'], P['memo'], P['agree'])
            if setname == 'Weekly':
                d['weekly_sig'] = S
            for pn, per in periods.items():
                if setname == 'Original':
                    rows.append([pn, 'Baseline (all weeks)', '', int(per.sum())]
                                + [pct(fwd[k][per].mean()) for k in H] + [pct((fwd[13][per] > 0).mean() * 100, 0, False)])
                for name in ('BUY', 'God-mode bull start', 'SELL', 'God-mode bear start'):
                    dirn = 1 if name in ('BUY', 'God-mode bull start') else -1
                    m = S[name] & per
                    r = {k: fwd[k][m].dropna() for k in H}
                    rows.append([pn, name, setname, int(m.sum())]
                                + [pct(r[k].mean()) if len(r[k]) else '-' for k in H]
                                + [pct((r[13] * dirn > 0).mean() * 100, 0, False) if len(r[13]) else '-'])
        order = ['Baseline (all weeks)', 'BUY', 'God-mode bull start', 'SELL', 'God-mode bear start']
        rows.sort(key=lambda r: (r[0] != 'Train', r[2] != '', r[2] != 'Original', order.index(r[1])))
        w(md_table(rows, ['Period', 'Signal', 'Settings', 'N', 'Avg 4w', 'Avg 13w', 'Avg 26w', 'Hit 13w']))
        w('')

    # ── 2. Tuning ──
    w("## 2. Weekly tuning (Train only) and out-of-sample check\n")
    w("Grid: trend EMA {20,30,40,50} × oversold {30,35,40} × overbought {60,65,70} × memory {3,5,8} × agree {5,6}. "
      "Objective: 13-week excess return over baseline of buy-side signals plus sell-side signals, each with ≥8 trades. "
      "Ties go to the first combination in that order.\n")
    rows = []
    for sym in ETFS:
        d = R[sym]
        c, fwd, per_t, per_s = d['c'], d['fwd'], d['sig_periods']['Train'], d['sig_periods']['Test']
        def excess(mask, per, dirn):
            r = fwd[13][mask & per].dropna()
            return len(r), (r.mean() - fwd[13][per].mean()) * dirn if len(r) else np.nan
        best = None
        for combo in itertools.product((20, 30, 40, 50), (30, 35, 40), (60, 65, 70), (3, 5, 8), (5, 6)):
            S = signals(c, d['ind'], d['ec'], *combo)
            nb, eb = excess(S['BUY'] | S['God-mode bull start'], per_t, 1)
            ns, es = excess(S['SELL'] | S['God-mode bear start'], per_t, -1)
            if nb >= 8 and ns >= 8 and (best is None or eb + es > best[0]):
                best = (eb + es, combo)
        combo = best[1]
        S = signals(c, d['ind'], d['ec'], *combo)
        nb_t, eb_t = excess(S['BUY'] | S['God-mode bull start'], per_t, 1)
        nb_s, eb_s = excess(S['BUY'] | S['God-mode bull start'], per_s, 1)
        ns_t, es_t = excess(S['SELL'] | S['God-mode bear start'], per_t, -1)
        ns_s, es_s = excess(S['SELL'] | S['God-mode bear start'], per_s, -1)
        rows.append([sym.upper(), f"EMA{combo[0]} {combo[1]}/{combo[2]} mem{combo[3]} {combo[4]}/7",
                     f"{pct(eb_t)} (n={nb_t})", f"{pct(eb_s)} (n={nb_s})", f"{pct(es_t)} (n={ns_t})", f"{pct(es_s)} (n={ns_s})"])
    w(md_table(rows, ['ETF', 'Best on Train', 'Buy-side edge Train', 'Buy-side edge Test', 'Sell-side edge Train', 'Sell-side edge Test']))
    w("\nEdge = average 13-week return after the signal minus the all-weeks average, sign-flipped for sells (positive = signal helped). "
      "The SPY result became the Weekly preset.\n")

    # ── 3. As a filter on other entries ──
    w("## 3. GodMode as a filter on other entries\n")
    w("Entries: **MA** 10/40-week SMA cross; **Donchian** close above prior 20-week high, exit below prior 10-week low; "
      "**Dip** close below the 20-week Bollinger band (2σ), exit back above the 20-week SMA. "
      "Filters checked at the entry bar only. 'Early exit' also exits when a god-mode bear starts.\n")
    blk_rows, rows = [], []
    for sym in ETFS:
        d = R[sym]
        c, dates, ind, ret = d['c'], d['dates'], d['ind'], d['ret']
        score, bull = ind['score'], ind['bull']
        S = d['weekly_sig']
        gbear, gbear_on = S['_godBear'], S['God-mode bear start']
        f10, s40 = sma(c, 10), sma(c, 40)
        valid = score.notna() & s40.notna() & ema(c, 200).notna()
        entries = {'MA': (f10 > s40, f10 < s40),
                   'Donchian': (c > c.shift().rolling(20).max(), c < c.shift().rolling(10).min()),
                   'Dip': (c < sma(c, 20) - 2 * c.rolling(20).std(ddof=0), c > sma(c, 20))}
        filters = {'score>50': score > 50, 'not god-bear': ~gbear, '≥5/7 bull': bull >= 5}
        periods = {'Train': valid & (dates < SPLIT_DATE), 'Test': valid & (dates >= SPLIT_DATE)}
        for en, (ent, ex) in entries.items():
            fresh = ent & ~ent.shift(fill_value=False) & valid
            blk_rows.append([sym.upper(), en, int(fresh.sum())] + [int((fresh & ~f).sum()) for f in filters.values()])
            variants = {'none': run_position(ent, ex, valid)}
            variants.update({fn: run_position(ent, ex, valid, allow=f) for fn, f in filters.items()})
            variants['early exit'] = run_position(ent, ex, valid, allow=~gbear, force_exit=gbear_on)
            for pn, per in periods.items():
                base = equity_stats(variants['none'], ret, per)
                cells = [sym.upper(), en, pn, f"{pct(base['cagr'], 1)} / {base['dd']:.0f}%"]
                same = all(np.array_equal(variants[f].values, variants['none'].values) for f in filters)
                none_left = all(not variants[f][per].any() for f in filters)
                cells.append('identical to unfiltered' if same else 'blocks every entry (0 trades)' if none_left else ' · '.join(
                    f"{fn}: {pct(equity_stats(variants[fn], ret, per)['cagr'], 1)}" for fn in filters))
                ee = equity_stats(variants['early exit'], ret, per)
                cells.append(f"{pct(ee['cagr'], 1)} / {ee['dd']:.0f}%" if variants['early exit'][per].any() else '0 trades')
                rows.append(cells)
    w(md_table(blk_rows, ['ETF', 'Entry', 'Fresh entries', 'Blocked: score>50', 'Blocked: god-bear', 'Blocked: <5/7 bull']))
    w('')
    w(md_table(rows, ['ETF', 'Entry', 'Period', 'Unfiltered CAGR / max DD', 'With entry filter (CAGR)', 'Early exit CAGR / max DD']))
    w("\nTrend entries happen when momentum is already bullish, so the filter never blocks them; dips happen when it is bearish, so it blocks all of them.\n")

    # ── 4. Regime ──
    w("## 4. Volatility + breadth regime\n")
    w("Breadth = % of the 9 sector SPDRs above their 40-week SMA (weak below 50%). Volatility = 13-week stdev of weekly log returns, "
      "percentile vs the prior 156 weeks (high above 80). **Risk-on** = breadth not weak and volatility not high. Rules fixed before testing.\n")
    rows, strat_rows = [], []
    for sym in ETFS:
        d = R[sym]
        c, dates, fwd, ret, br = d['c'], d['dates'], d['fwd'], d['ret'], d['breadth']
        lr = np.log(c / c.shift())
        vol = lr.rolling(13).std() * np.sqrt(52) * 100
        volpct = vol.rolling(157).apply(lambda x: (x[:-1] < x[-1]).mean() * 100, raw=True)
        b_ok, v_ok = br >= 50, volpct <= 80
        on = b_ok & v_ok
        d.update(vol=vol, volpct=volpct, on=on)
        valid = br.notna() & volpct.notna() & d['ind']['score'].notna() & sma(c, 40).notna()
        for pn, per in {'Train': valid & (dates < SPLIT_DATE), 'Test': valid & (dates >= SPLIT_DATE)}.items():
            for nm, m in (('All weeks', per), ('Risk-on', per & on), ('Risk-off', per & ~on),
                          ('Breadth weak', per & ~b_ok), ('Vol high', per & ~v_ok)):
                r13 = fwd[13][m].dropna()
                rows.append([sym.upper(), pn, nm, int(m.sum()), pct(r13.mean()), pct((r13 > 0).mean() * 100, 0, False), pct(r13.std(), 1, False)])
    w(md_table(rows, ['ETF', 'Period', 'State', 'Weeks', 'Avg 13w', 'Up 13w', 'Stdev 13w']))
    w("\nLower 'Stdev 13w' in risk-on = calmer outcomes. Higher 'Avg 13w' in risk-off (2017–26) = rebounds after sell-offs.\n")

    # ── 5. Sizing ──
    w("## 5. Position sizing by regime\n")
    w("Exposure 100% in risk-on and 50% / 25% / 0% in risk-off, compared with a **fixed exposure equal to the 100/50 rule's average** "
      "(the fair test: owning less always lowers swings) and with volatility targeting (exposure = trailing 3-year median vol ÷ current vol, capped at 100%).\n")
    rows, cmp_rows = [], []
    wins_dd = wins_ret = 0
    for sym in ETFS:
        d = R[sym]
        c, dates, ret, on, vol, br, volpct = d['c'], d['dates'], d['ret'], d['on'], d['vol'], d['breadth'], d['volpct']
        medvol = vol.rolling(156).median()
        valid = br.notna() & volpct.notna() & medvol.notna()
        for pn, per in {'Train': valid & (dates < SPLIT_DATE), 'Test': valid & (dates >= SPLIT_DATE)}.items():
            r50 = on.astype(float).where(on, 0.5)
            fixed = pd.Series(r50[per].mean(), index=c.index)
            rules = {'Buy & hold': pd.Series(1.0, index=c.index), 'Regime 100/50': r50,
                     'Regime 100/25': on.astype(float).where(on, 0.25), 'Regime 100/0': on.astype(float),
                     f"Fixed {fixed.iloc[0] * 100:.0f}%": fixed, 'Vol target': (medvol / vol).clip(upper=1)}
            st = {nm: equity_stats(wt, ret, per) for nm, wt in rules.items()}
            for nm, s in st.items():
                rows.append([sym.upper(), pn, nm, pct(s['total'], 0), pct(s['cagr'], 1), f"{s['dd']:.0f}%", f"{s['rr']:.2f}", f"{s['exp']:.0f}%"])
            a, b = st['Regime 100/50'], st[f"Fixed {fixed.iloc[0] * 100:.0f}%"]
            wins_dd += a['dd'] > b['dd']
            wins_ret += round(a['cagr'], 1) >= round(b['cagr'], 1)
            cmp_rows.append([f"{sym.upper()} {pn}", f"{pct(a['cagr'], 1)} / {a['dd']:.0f}%", f"{pct(b['cagr'], 1)} / {b['dd']:.0f}%"])
    w(md_table(cmp_rows, ['', 'Regime 100/50: CAGR / max DD', 'Fixed same average: CAGR / max DD']))
    w(f"\nSmaller max drawdown than fixed exposure in **{wins_dd} of {len(cmp_rows)}**; equal or higher CAGR in **{wins_ret} of {len(cmp_rows)}**.\n")
    w("<details><summary>All sizing rules</summary>\n")
    w(md_table(rows, ['ETF', 'Period', 'Rule', 'Total', 'CAGR', 'Max DD', 'Return / vol', 'Avg exposure']))
    w("\n</details>\n")

    # ── 6. Current readings ──
    w("## 6. Latest readings\n")
    rows = []
    for sym in ETFS:
        d = R[sym]
        ind, c = d['ind'], d['c']
        e20 = ema(c, 20)
        rows.append([sym.upper(), d['dates'].iloc[-1].date(), f"{c.iloc[-1]:.2f}", f"{ind['score'].iloc[-1]:.1f}",
                     'rising' if ind['score'].iloc[-1] > ind['sig'].iloc[-1] else 'falling',
                     f"{ind['bull'].iloc[-1]}/7 bull", 'above' if c.iloc[-1] > e20.iloc[-1] else 'below',
                     f"{d['volpct'].iloc[-1]:.0f}", f"{d['breadth'].iloc[-1]:.0f}%",
                     'RISK-ON' if d['on'].iloc[-1] else 'RISK-OFF', '100%' if d['on'].iloc[-1] else '50%'])
    w(md_table(rows, ['ETF', 'Week', 'Close', 'Score', 'Direction', 'Agreement', 'vs 20w EMA', 'Vol pct', 'Breadth', 'Regime', 'Exposure']))
    w("\n## Caveats\n")
    w("- Weekly bars only; three ETFs, one of which (SPY) mostly rose.")
    w("- The sizing result leans on one slow bear market (2008).")
    w("- Dividends excluded (understates buy & hold, most for EEM and XLE); cash assumed to earn 0%.")
    w("- The Python port follows the Pine script's formulas; small differences in indicator warm-up are possible.")
    w("- Not financial advice.")

    path = os.path.join(HERE, 'REPORT.md')
    with open(path, 'w') as f:
        f.write('\n'.join(L) + '\n')
    print(f"wrote {path}")


if __name__ == '__main__':
    main()
