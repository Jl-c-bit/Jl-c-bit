"""GodMode as a FILTER on two classic weekly trend entries (no tuning).
Entries:  MA  = long while 10-wk SMA > 40-wk SMA, exit when it crosses back below
          DON = enter on close above prior 20-wk high, exit on close below prior 10-wk low
Filters (checked only at the entry bar):
          score>50   | not god-mode bear | >=5 of 7 components bullish
Exit variant: also exit early when god-mode bear starts.
Signal on bar close, position from next week. 0.05% cost per side. Dividends excluded."""
import sys, numpy as np, pandas as pd
from gm_lib import *
comp=pd.DataFrame({'RSI':rsi(c,14),'MFI':mfi(hlc3,14),'Stoch':sma(stoch(14),3),'CCI':squash(cci(hlc3,20),100),
 'WPR':100+wpr(14),'TSI':50+50*tsi(c,13,25),'Trend':squash((c-ema(c,21))/atr(21),1.0)})
score=ema(comp.mean(axis=1,skipna=False),3); sig=sma(score,5)
bull=(comp>50).sum(axis=1); bear=(comp<50).sum(axis=1)
e20=ema(c,20); godBear=(bear>=5)&(score<50)&(score<sig)&(c<e20)
godBearOn=godBear&~godBear.shift(fill_value=False)
f,s=sma(c,10),sma(c,40)
entries={'MA 10/40':(f>s, f<s),
         'Donchian 20/10':(c>c.shift().rolling(20).max(), c<c.shift().rolling(10).min()),
         'Dip (BB 20,2)':(c<sma(c,20)-2*c.rolling(20).std(ddof=0), c>sma(c,20))}
filters={'none':pd.Series(True,index=c.index),'score>50':score>50,'not god-bear':~godBear,'>=5/7 bull':bull>=5}
ret=c.pct_change().shift(-1)            # next week's return
dates=df.timestamp; valid=score.notna()&s.notna()&ema(c,200).notna()
periods={'2003-16':valid&(dates<'2017-01-01'),'2017-26':valid&(dates>='2017-01-01')}
COST=0.0005
def run(entry,exit_,flt,early_exit=False):
    pos=np.zeros(len(c),bool); inpos=False; trades=[]; start=None
    for i in range(len(c)):
        if not valid[i]: inpos=False; continue
        if inpos and (exit_[i] or (early_exit and godBearOn[i])):
            inpos=False; trades.append(c[i]/c[start]-1)
        elif not inpos and entry[i] and flt[i] and not (early_exit and godBear[i]):
            inpos=True; start=i
        pos[i]=inpos
    pos=pd.Series(pos); turn=pos.astype(int).diff().abs().fillna(0)
    r=(ret.where(pos,0)-turn*COST)
    return r,pos,trades
def stats(r,pos,per):
    x=r[per].fillna(0); eq=(1+x).cumprod(); yrs=per.sum()/52
    turns=pos.astype(int).diff().abs()[per].sum()
    return dict(total=(eq.iloc[-1]-1)*100, cagr=(eq.iloc[-1]**(1/yrs)-1)*100, maxdd=(eq/eq.cummax()-1).min()*100,
                invested=pos[per].mean()*100, trades=int(turns//2))
rows=[]
for pn,per in periods.items():
    bh=stats(ret,pd.Series(True,index=c.index),per)
    rows.append([pn,'Buy & hold','-',f"{bh['total']:+.0f}%",f"{bh['cagr']:+.1f}%",f"{bh['maxdd']:.0f}%","100%",'-'])
    for en,(ent,ex) in entries.items():
        for fn,flt in filters.items():
            r,pos,_=run(ent,ex,flt); st=stats(r,pos,per)
            rows.append([pn,en,fn,f"{st['total']:+.0f}%",f"{st['cagr']:+.1f}%",f"{st['maxdd']:.0f}%",f"{st['invested']:.0f}%",st['trades']])
        r,pos,_=run(ent,ex,filters['none'],early_exit=True); st=stats(r,pos,per)
        rows.append([pn,en,'god-bear early exit',f"{st['total']:+.0f}%",f"{st['cagr']:+.1f}%",f"{st['maxdd']:.0f}%",f"{st['invested']:.0f}%",st['trades']])
# How often would each filter have blocked an entry?
for en,(ent,ex) in entries.items():
    first=ent&~ent.shift(fill_value=False)&valid
    print(f"  {en}: {int(first.sum())} fresh entry bars; blocked by score>50: {int((first&~(score>50)).sum())}, by god-bear: {int((first&godBear).sum())}, by <5/7 bull: {int((first&~(bull>=5)).sum())}")
print(f"{sys.argv[1]}: {dates[valid].iloc[0].date()} -> {dates.iloc[-1].date()}")
print(pd.DataFrame(rows,columns=['Period','Entry','GodMode filter','Total','CAGR','Max DD','Invested','Trades']).to_string(index=False))
