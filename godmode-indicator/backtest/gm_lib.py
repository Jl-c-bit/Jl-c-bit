import sys, numpy as np, pandas as pd
df = pd.read_csv((sys.argv[1] if len(sys.argv)>1 else 'spy_weekly.csv'), parse_dates=['timestamp']).sort_values('timestamp').reset_index(drop=True)
# Back-adjust share splits (free Alpha Vantage weekly data is unadjusted):
# a week whose close is ~2x/3x/4x below the previous close is treated as a split.
for i in range(1, len(df)):
    ratio = df.close[i-1] / df.close[i]
    k = round(ratio)
    if k >= 2 and abs(ratio - k) / k < 0.08:
        for col in ('open', 'high', 'low', 'close'):
            df.loc[:i-1, col] /= k
        df.loc[:i-1, 'volume'] *= k
        for col in ('open', 'high'):              # split week mixes pre/post prices
            if df.loc[i, col] > df.close[i] * 1.5: df.loc[i, col] /= k
        print(f"[split-adjusted {k}:1 at {df.timestamp[i].date()}]")
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
