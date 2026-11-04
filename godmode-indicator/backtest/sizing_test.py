"""Position sizing by market regime (rules fixed in advance).
Exposure rules (decided at weekly close, applied to next week):
  Buy & hold            100%
  Regime 100/50         100% risk-on, 50% risk-off
  Regime 100/25         100% risk-on, 25% risk-off
  Regime 100/0          100% risk-on, cash risk-off
  Fixed (same avg)      constant exposure = average exposure of Regime 100/50  <- the fair comparison
  Vol target            min(100%, trailing-3y median vol / current 13w vol)
Cash earns 0% (conservative). Cost 0.05% per 100% of exposure traded. Dividends excluded."""
import sys, numpy as np, pandas as pd
from gm_lib import *
SECT=['xlb','xle','xlf','xli','xlk','xlp','xlu','xlv','xly']
above=[]
for t in SECT:
    d=split_adjust(pd.read_csv(f'{t}_weekly.csv',parse_dates=['timestamp']).sort_values('timestamp').reset_index(drop=True),verbose=False)
    above.append(pd.Series((d.close>d.close.rolling(40).mean()).where(d.close.rolling(40).count()==40).values,index=d.timestamp))
breadth=pd.Series((pd.concat(above,axis=1).mean(axis=1)*100).reindex(df.timestamp).values)
lr=np.log(c/c.shift()); vol=lr.rolling(13).std()*np.sqrt(52)*100
volpct=vol.rolling(157).apply(lambda w:(w[:-1]<w[-1]).mean()*100,raw=True)
on=(breadth>=50)&(volpct<=80)
medvol=vol.rolling(156).median()
dates=df.timestamp; valid=breadth.notna()&volpct.notna()&medvol.notna()
P={'2003-16':valid&(dates<'2017-01-01'),'2017-26':valid&(dates>='2017-01-01'),'Full':valid}
ret=c.pct_change().shift(-1); COST=0.0005
def perf(w,per):
    w=w.fillna(0).clip(0,1); turn=w.diff().abs().fillna(0)
    x=(w*ret-turn*COST)[per].fillna(0); eq=(1+x).cumprod(); yrs=len(x)/52
    cagr=eq.iloc[-1]**(1/yrs)-1; dd=(eq/eq.cummax()-1).min(); sd=x.std()*np.sqrt(52)
    return dict(Total=f"{(eq.iloc[-1]-1)*100:+.0f}%",CAGR=f"{cagr*100:+.1f}%",Vol=f"{sd*100:.1f}%",MaxDD=f"{dd*100:.0f}%",
                RetPerRisk=f"{cagr/sd:.2f}" if sd else '-',RetPerDD=f"{cagr/abs(dd):.2f}" if dd else '-',AvgExp=f"{w[per].mean()*100:.0f}%")
print(f"== {sys.argv[1]}   {dates[valid].iloc[0].date()} -> {dates.iloc[-1].date()}")
rows=[]
for pn,per in P.items():
    r50=on.astype(float).where(on,0.5)
    fixed=pd.Series(r50[per].mean(),index=c.index)
    rules={'Buy & hold':pd.Series(1.0,index=c.index),'Regime 100/50':r50,'Regime 100/25':on.astype(float).where(on,0.25),
           'Regime 100/0':on.astype(float),f'Fixed {fixed.iloc[0]*100:.0f}% (same avg)':fixed,'Vol target':(medvol/vol).clip(upper=1)}
    for nm,w in rules.items(): rows.append({'Period':pn,'Rule':nm,**perf(w,per)})
print(pd.DataFrame(rows).to_string(index=False))
