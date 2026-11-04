import itertools, numpy as np, pandas as pd
from gm_lib import *
comp=pd.DataFrame({'RSI':rsi(c,14),'MFI':mfi(hlc3,14),'Stoch':sma(stoch(14),3),'CCI':squash(cci(hlc3,20),100),
 'WPR':100+wpr(14),'TSI':50+50*tsi(c,13,25),'Trend':squash((c-ema(c,21))/atr(21),1.0)})
score=ema(comp.mean(axis=1,skipna=False),3); sig=sma(score,5)
bull=(comp>50).sum(axis=1); bear=(comp<50).sum(axis=1)
cu=(score>sig)&(score.shift()<=sig.shift()); cd=(score<sig)&(score.shift()>=sig.shift())
fwd={k:(c.shift(-k)/c-1)*100 for k in (4,13,26)}
emas={n:ema(c,n) for n in (20,30,40,50,200)}
def signals(trendLen,osL,obL,memo,minAgree):
    t=emas[trendLen]; up=c>t; dn=c<t
    rl=score.rolling(memo).min(); rh=score.rolling(memo).max()
    gb=(bull>=minAgree)&(score>50)&(score>sig)&up; gs=(bear>=minAgree)&(score<50)&(score<sig)&dn
    return dict(BUY=cu&(rl<=osL)&up, SELL=cd&(rh>=obL)&dn,
                GodBullStart=gb&~gb.shift(fill_value=False), GodBearStart=gs&~gs.shift(fill_value=False), _gs=gs)
dates=df.timestamp; valid=emas[200].notna()   # same start date for every config
train=valid&(dates<'2017-01-01'); test=valid&(dates>='2017-01-01')
def ex(mask,period,k=13,d=1):
    r=fwd[k][mask&period].dropna(); b=fwd[k][period].dropna().mean()
    return len(r), (r.mean()-b)*d if len(r) else np.nan
# Tune on TRAIN only. Objective: buy-side edge (BUY + god-mode bull starts) + sell-side edge, each needs >=8 trades
best=[]
for tl,osL,obL,memo,ma in itertools.product((20,30,40,50),(30,35,40),(60,65,70),(3,5,8),(5,6)):
    S=signals(tl,osL,obL,memo,ma)
    nb,eb=ex(S['BUY']|S['GodBullStart'],train); ns,es=ex(S['SELL']|S['GodBearStart'],train,d=-1)
    if nb<8 or ns<8: continue
    best.append((eb+es,tl,osL,obL,memo,ma,nb,eb,ns,es))
best.sort(reverse=True)
print("Top 5 configs on 2003-2016 (13w excess vs baseline, buy side + sell side):")
for b in best[:5]: print(f"  EMA{b[1]} OS{b[2]} OB{b[3]} memo{b[4]} agree{b[5]} | buys n={b[6]} {b[7]:+.2f}% | sells n={b[8]} {b[9]:+.2f}%")
_,tl,osL,obL,memo,ma=best[0][:6]
print(f"\nData: {dates.iloc[0].date()} -> {dates.iloc[-1].date()}; scored from {dates[valid].iloc[0].date()}; price {c[valid].iloc[0]:.2f} -> {c.iloc[-1]:.2f}")
def table(P,label):
    S=signals(*P); print(f"\n{label}  (EMA{P[0]}, OS{P[1]}, OB{P[2]}, memo{P[3]}, agree{P[4]})")
    rows=[]
    for per_name,per in (("2003-16 train",train),("2017-26 test",test)):
        for k in (4,13,26):
            pass
        rows.append([per_name,'Baseline (all weeks)',int(per.sum())]+[f"{fwd[k][per].dropna().mean():+.2f}%" for k in (4,13,26)]+['']*3)
        for name in ('BUY','GodBullStart','SELL','GodBearStart'):
            d=1 if name in('BUY','GodBullStart') else -1; m=S[name]&per; r={k:fwd[k][m].dropna() for k in (4,13,26)}
            rows.append([per_name,name,int(m.sum())]+[f"{r[k].mean():+.2f}%" if len(r[k]) else '-' for k in (4,13,26)]+[f"{(r[k]*d>0).mean()*100:.0f}%" if len(r[k]) else '-' for k in (4,13,26)])
    print(pd.DataFrame(rows,columns=['Period','Signal','N','avg 4w','avg 13w','avg 26w','hit 4w','hit 13w','hit 26w']).to_string(index=False))
    return S
table((200,25,75,5,6),"ORIGINAL settings")
S=table((20,35,65,8,5),"SPY WEEKLY PRESET (unchanged)")
table((tl,osL,obL,memo,ma),"TUNED FOR THIS SYMBOL (2003/7-2016 only)")
# Practical use: hold SPY, step aside while god-mode bear is active, re-enter when it ends
def strat(gs,per):
    r=c.pct_change().shift(-1)  # next week's return
    inmkt=~gs
    a=(1+r[per&inmkt.reindex(r.index)].fillna(0)).prod(); full=(1+r[per].fillna(0)).prod()
    ret_in=r.where(inmkt,0)[per]; ret_bh=r[per]
    dd=lambda x:((1+x.fillna(0)).cumprod()/(1+x.fillna(0)).cumprod().cummax()-1).min()*100
    return (1+ret_in.fillna(0)).prod()-1, full-1, dd(ret_in), dd(ret_bh), (inmkt[per]).mean()*100
print("\nHold the ETF, but sit in cash while god-mode BEAR is active (SPY weekly preset):")
for nm,per in (("2003-16 train",train),("2017-26 test",test)):
    s,bh,dds,ddb,pct=strat(S['_gs'],per)
    print(f"  {nm}: strategy {s*100:+.0f}% (max drawdown {dds:.0f}%) vs buy&hold {bh*100:+.0f}% (max drawdown {ddb:.0f}%), invested {pct:.0f}% of weeks")
last=len(df)-1
print(f"\nLatest {dates.iloc[-1].date()}: score {score.iloc[-1]:.1f}, signal {sig.iloc[-1]:.1f}, bull {bull.iloc[-1]}/7, bear {bear.iloc[-1]}/7, above EMA20: {bool(c.iloc[-1]>emas[20].iloc[-1])} ({emas[20].iloc[-1]:.2f}), godBear active: {bool(S['_gs'].iloc[-1])}")
e=pd.DataFrame({k:v for k,v in S.items() if not k.startswith('_')}); e['date']=dates; e=e.melt(id_vars='date'); e=e[e.value].sort_values('date')
print("Last 8 retuned signals:"); print(e.tail(8)[['date','variable']].to_string(index=False))
