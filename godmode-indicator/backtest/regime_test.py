"""Volatility + breadth regime test (rules fixed in advance, no tuning).
Breadth  = % of 9 original sector SPDRs (XLB XLE XLF XLI XLK XLP XLU XLV XLY) closing above their 40-wk SMA.
Vol      = 13-wk stdev of weekly log returns of the traded ETF, percentile-ranked vs the prior 156 wks.
Rules:   breadth OK  = breadth >= 50%      vol OK = vol percentile <= 80
         regime ON   = breadth OK and vol OK
Tests:   (1) forward returns by regime   (2) hold only when regime ON vs buy & hold
         (3) regime as entry filter / exit on the 10/40-wk MA system and on GodMode buy signals."""
import sys, numpy as np, pandas as pd
from gm_lib import *
SECT=['xlb','xle','xlf','xli','xlk','xlp','xlu','xlv','xly']
above=[]
for t in SECT:
    d=split_adjust(pd.read_csv(f'{t}_weekly.csv',parse_dates=['timestamp']).sort_values('timestamp').reset_index(drop=True),verbose=False)
    above.append(pd.Series((d.close>d.close.rolling(40).mean()).where(d.close.rolling(40).count()==40).values,index=d.timestamp,name=t))
B=pd.concat(above,axis=1)
breadth=(B.mean(axis=1)*100).reindex(df.timestamp).values; breadth=pd.Series(breadth)
lr=np.log(c/c.shift()); vol=lr.rolling(13).std()*np.sqrt(52)*100
volpct=vol.rolling(157).apply(lambda w:(w[:-1]<w[-1]).mean()*100,raw=True)
bOK=breadth>=50; vOK=volpct<=80; on=bOK&vOK
# GodMode score (unchanged) for the combined test
comp=pd.DataFrame({'RSI':rsi(c,14),'MFI':mfi(hlc3,14),'Stoch':sma(stoch(14),3),'CCI':squash(cci(hlc3,20),100),
 'WPR':100+wpr(14),'TSI':50+50*tsi(c,13,25),'Trend':squash((c-ema(c,21))/atr(21),1.0)})
score=ema(comp.mean(axis=1,skipna=False),3); sig=sma(score,5)
e20=ema(c,20); cu=(score>sig)&(score.shift()<=sig.shift()); rl=score.rolling(8).min()
gmBuy=cu&(rl<=35)&(c>e20)
dates=df.timestamp; valid=breadth.notna()&volpct.notna()&score.notna()&sma(c,40).notna()
P={'2003-16':valid&(dates<'2017-01-01'),'2017-26':valid&(dates>='2017-01-01')}
fwd={k:(c.shift(-k)/c-1)*100 for k in (4,13,26)}
ret=c.pct_change().shift(-1); COST=0.0005
print(f"== {sys.argv[1]}  scored {dates[valid].iloc[0].date()} -> {dates.iloc[-1].date()}")
print(f"Now: breadth {breadth.iloc[-1]:.0f}% ({', '.join(t.upper() for t in SECT if B[t].iloc[-1]==1)} above 40wk)  vol {vol.iloc[-1]:.1f}% ann. = {volpct.iloc[-1]:.0f}th pct  regime {'ON' if on.iloc[-1] else 'OFF'}")
print("\n(1) Avg forward return by state")
rows=[]
for pn,per in P.items():
    for nm,m in (('all weeks',per),('breadth OK',per&bOK),('breadth weak',per&~bOK),('vol normal',per&vOK),('vol high',per&~vOK),('regime ON',per&on),('regime OFF',per&~on)):
        r={k:fwd[k][m].dropna() for k in (4,13,26)}
        sd=r[13].std()
        rows.append([pn,nm,int(m.sum()),*(f"{r[k].mean():+.2f}%" for k in (4,13,26)),f"{(r[13]>0).mean()*100:.0f}%",f"{sd:.1f}%"])
print(pd.DataFrame(rows,columns=['Period','State','Weeks','avg 4w','avg 13w','avg 26w','up 13w','stdev 13w']).to_string(index=False))
def equity(pos,per):
    pos=pos.fillna(False).astype(bool); turn=pos.astype(int).diff().abs().fillna(0)
    x=(ret.where(pos,0)-turn*COST)[per].fillna(0); eq=(1+x).cumprod(); yrs=per.sum()/52
    return f"{(eq.iloc[-1]-1)*100:+.0f}%", f"{(eq.iloc[-1]**(1/yrs)-1)*100:+.1f}%", f"{(eq/eq.cummax()-1).min()*100:.0f}%", f"{pos[per].mean()*100:.0f}%", int(turn[per].sum()//2)
def system(entry,exit_,flt=None,exit_flt=None):
    pos=np.zeros(len(c),bool); inp=False
    for i in range(len(c)):
        if not valid[i]: inp=False; continue
        if inp and (exit_[i] or (exit_flt is not None and not exit_flt[i])): inp=False
        elif not inp and entry[i] and (flt is None or flt[i]): inp=True
        pos[i]=inp
    return pd.Series(pos)
f10,s40=sma(c,10),sma(c,40)
maE,maX=f10>s40,f10<s40
gmX=pd.Series(False,index=c.index)  # GodMode buy: hold 13 weeks
hold=np.zeros(len(c),bool)
cnt=0
for i in range(len(c)):
    if gmBuy[i] and valid[i]: cnt=13
    hold[i]=cnt>0; cnt=max(cnt-1,0)
hold=pd.Series(hold)
print("\n(2)+(3) Strategies (signal at close, trade next week, 0.05%/side)")
rows=[]
for pn,per in P.items():
    strat={'Buy & hold':pd.Series(True,index=c.index),
           'Hold only when regime ON':on,
           'Hold only when breadth OK':bOK,
           'Hold only when vol normal':vOK,
           'MA 10/40':system(maE,maX),
           'MA 10/40 + regime entry filter':system(maE,maX,flt=on),
           'MA 10/40 + exit when regime OFF':system(maE,maX,flt=on,exit_flt=on),
           'GodMode BUY, hold 13w':hold,
           'GodMode BUY + regime ON, hold 13w':hold&on}
    for nm,pos in strat.items(): rows.append([pn,nm,*equity(pos,per)])
print(pd.DataFrame(rows,columns=['Period','Strategy','Total','CAGR','Max DD','Invested','Trades']).to_string(index=False))
first=maE&~maE.shift(fill_value=False)&valid
print(f"\nMA entries blocked by regime filter: {int((first&~on).sum())} of {int(first.sum())}")
