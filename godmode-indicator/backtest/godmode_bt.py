import sys, numpy as np, pandas as pd
df = pd.read_csv(sys.argv[1], parse_dates=['timestamp']).sort_values('timestamp').reset_index(drop=True)
o,h,l,c,v = df.open,df.high,df.low,df.close,df.volume
def ema(x,n):
    x=pd.Series(x,dtype=float); out=np.full(len(x),np.nan); a=2/(n+1); prev=np.nan; vals=x.values; buf=[]
    for i,val in enumerate(vals):
        if np.isnan(val): continue
        if np.isnan(prev):
            buf.append(val)
            if len(buf)==n: prev=np.mean(buf); out[i]=prev
        else: prev=a*val+(1-a)*prev; out[i]=prev
    return pd.Series(out)
def rma(x,n):
    x=pd.Series(x,dtype=float); out=np.full(len(x),np.nan); prev=np.nan; buf=[]
    for i,val in enumerate(x.values):
        if np.isnan(val): continue
        if np.isnan(prev):
            buf.append(val)
            if len(buf)==n: prev=np.mean(buf); out[i]=prev
        else: prev=(val+(n-1)*prev)/n; out[i]=prev
    return pd.Series(out)
sma=lambda x,n: pd.Series(x).rolling(n).mean()
def rsi(s,n):
    d=s.diff(); return 100-100/(1+rma(d.clip(lower=0),n)/rma((-d).clip(lower=0),n))
def mfi(src,n):
    ch=src.diff(); up=(v*np.where(ch>0,src,0)).rolling(n).sum(); dn=(v*np.where(ch<0,src,0)).rolling(n).sum()
    return 100-100/(1+up/dn)
def stoch(n): ll=l.rolling(n).min(); hh=h.rolling(n).max(); return 100*(c-ll)/(hh-ll)
def cci(src,n):
    m=src.rolling(n).mean(); md=src.rolling(n).apply(lambda w: np.mean(np.abs(w-w.mean())),raw=True); return (src-m)/(0.015*md)
def wpr(n): hh=h.rolling(n).max(); ll=l.rolling(n).min(); return 100*(c-hh)/(hh-ll)
def tsi(s,short,long):
    pc=s.diff(); return ema(ema(pc,long),short)/ema(ema(pc.abs(),long),short)
def atr(n):
    tr=pd.concat([h-l,(h-c.shift()).abs(),(l-c.shift()).abs()],axis=1).max(axis=1); tr.iloc[0]=h.iloc[0]-l.iloc[0]; return rma(tr,n)
squash=lambda x,k: 50+50*(x/(x.abs()+k))
hlc3=(h+l+c)/3
P=dict(osL=25,obL=75,exOs=12,exOb=88,memo=5,minAgree=6,trendLen=200,useTrend=True,pivL=5,pivR=5,divMax=60)
comp=pd.DataFrame({
 'RSI':rsi(c,14),'MFI':mfi(hlc3,14),'Stoch':sma(stoch(14),3),'CCI':squash(cci(hlc3,20),100),
 'WPR':100+wpr(14),'TSI':50+50*tsi(c,13,25),'Trend':squash((c-ema(c,21))/atr(21),1.0)})
score=ema(comp.mean(axis=1,skipna=False),3); sig=sma(score,5)
bull=(comp>50).sum(axis=1); bear=(comp<50).sum(axis=1)
tema=ema(c,P['trendLen'])
up=(c>tema)|(not P['useTrend']); dn=(c<tema)|(not P['useTrend'])
godB=(bull>=P['minAgree'])&(score>50)&(score>sig)&up
godS=(bear>=P['minAgree'])&(score<50)&(score<sig)&dn
cu=(score>sig)&(score.shift()<=sig.shift()); cd=(score<sig)&(score.shift()>=sig.shift())
rl=score.rolling(P['memo']).min(); rh=score.rolling(P['memo']).max()
buy=cu&(rl<=P['osL'])&up; sell=cd&(rh>=P['obL'])&dn
sbuy=buy&(rl<=P['exOs']); ssell=sell&(rh>=P['exOb'])
gbon=godB&~godB.shift(fill_value=False); gson=godS&~godS.shift(fill_value=False)
# divergences (confirmed pivR bars later, like Pine)
R,L=P['pivR'],P['pivL']; bdiv=pd.Series(False,index=df.index); sdiv=bdiv.copy()
lastPL=lastPH=None
for i in range(L+R,len(df)):
    j=i-R; win=score.iloc[j-L:j+R+1]
    if win.isna().any(): continue
    if score[j]==win.min() and (win.values[:L]>score[j]).all() and (win.values[L+1:]>=score[j]).all():
        if lastPL is not None and score[j]>score[lastPL] and l[j]<l[lastPL] and score[j]<50 and j-lastPL<=P['divMax']: bdiv[i]=True
        lastPL=j
    if score[j]==win.max() and (win.values[:L]<score[j]).all() and (win.values[L+1:]<=score[j]).all():
        if lastPH is not None and score[j]<score[lastPH] and h[j]>h[lastPH] and score[j]>50 and j-lastPH<=P['divMax']: sdiv[i]=True
        lastPH=j
valid=tema.notna()  # only evaluate once the 200-bar trend EMA exists
H=[4,13,26]
fwd={k:(c.shift(-k)/c-1)*100 for k in H}
def stats(mask,name,direction=1):
    m=mask&valid; n=int(m.sum()); row=[name,n]
    for k in H:
        r=fwd[k][m].dropna()
        row += [f"{r.mean():+.2f}%" if len(r) else "-", f"{(r*direction>0).mean()*100:.0f}%" if len(r) else "-"]
    return row
rows=[stats(valid,'All weeks (baseline)'),stats(buy,'BUY'),stats(sbuy,'GOD BUY'),stats(gbon,'God-mode bull start'),stats(bdiv,'Bullish divergence'),
      stats(sell,'SELL',-1),stats(ssell,'GOD SELL',-1),stats(gson,'God-mode bear start',-1),stats(sdiv,'Bearish divergence',-1)]
cols=['Signal','N']+sum([[f'avg {k}w',f'hit {k}w'] for k in H],[])
out=pd.DataFrame(rows,columns=cols)
print(f"Data: {df.timestamp.iloc[0].date()} -> {df.timestamp.iloc[-1].date()}, {len(df)} weekly bars; evaluated from {df.timestamp[valid].iloc[0].date()}")
print(out.to_string(index=False))
print("\n'hit' = % of signals where price moved in the signal's direction (buys up, sells down)")
# Same signals without the 200 EMA filter, for comparison
print("\nLatest bar:", df.timestamp.iloc[-1].date(), "close", c.iloc[-1])
last=comp.iloc[-1].round(1).to_dict(); print("components:",last)
print(f"score {score.iloc[-1]:.1f} signal {sig.iloc[-1]:.1f} bull {bull.iloc[-1]}/7 bear {bear.iloc[-1]}/7 above200EMA {bool(c.iloc[-1]>tema.iloc[-1])} godBull {bool(godB.iloc[-1])} godBear {bool(godS.iloc[-1])}")
ev=pd.DataFrame({'date':df.timestamp,'close':c,'BUY':buy,'GOD BUY':sbuy,'SELL':sell,'GOD SELL':ssell,'GodBull':gbon,'GodBear':gson,'BullDiv':bdiv,'BearDiv':sdiv})
ev=ev[valid]; e=ev.melt(id_vars=['date','close']); e=e[e.value].sort_values('date')
print("\nLast 12 signals:"); print(e.tail(12)[['date','close','variable']].to_string(index=False))
pd.DataFrame({'date':df.timestamp,'close':c,'score':score.round(2),'signal':sig.round(2),'bull':bull,'ema200':tema.round(2)}).to_csv('spy_weekly_scores.csv',index=False)
e.to_csv('spy_weekly_signals.csv',index=False)
