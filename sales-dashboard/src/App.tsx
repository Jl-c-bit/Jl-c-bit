import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Moon, Sun } from "lucide-react";
import type { DashboardData, LeadStatus, OpenDealStage as Stage } from "./types.ts";
import styles from "./App.module.css";

const STAGE_LABEL: Record<Stage, string> = {
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
};
const STAGE_ORDER: Stage[] = ["qualified", "proposal", "negotiation"];

const SOURCE_LABEL: Record<string, string> = {
  referral: "Referral",
  website: "Website",
  linkedin: "LinkedIn",
  event: "Event",
  cold_outreach: "Outreach",
};

const STATUS_CLASS: Record<LeadStatus, string> = {
  new: styles.badgeSuccess,
  contacted: styles.badgeSecondary,
  qualified: styles.badgeWarning,
  unqualified: styles.badgeOutline,
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compactMoney = (n: number) =>
  "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
// expectedCloseDate is a plain YYYY-MM-DD date, so format it in UTC to avoid an off-by-one day.
const shortDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const leadDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dashboard", { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        setData(body as DashboardData);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, []);

  return { data, error };
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this visit.
    }
  };
  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function RevenueTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label}</div>
      <div className={styles.num}>{money(payload[0].value)}</div>
    </div>
  );
}

export default function App() {
  const { data, error } = useDashboard();
  const [stageFilter, setStageFilter] = useState<"all" | Stage>("all");

  const pipelineByStage = useMemo(
    () =>
      STAGE_ORDER.map((stage) => {
        const deals = (data?.openDeals ?? []).filter((d) => d.stage === stage);
        return { stage, count: deals.length, value: deals.reduce((s, d) => s + d.value, 0) };
      }),
    [data?.openDeals],
  );

  const header = (
    <header className={styles.header}>
      <div>
        <div className={styles.eyebrow}>Jl-c-bit Agency</div>
        <h1 className={styles.title}>Sales ledger</h1>
      </div>
      <div className={styles.headerRight}>
        <span className={styles.asOf}>
          As of {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </span>
        <ThemeToggle />
      </div>
    </header>
  );

  if (!data) {
    return (
      <div className={styles.page}>
        {header}
        {error ? (
          <div className={styles.errorBox}>Couldn't load the dashboard: {error}</div>
        ) : (
          <>
            <section className={styles.kpis}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={styles.kpi}>
                  <div className={`${styles.skeleton} ${styles.skelLabel}`} />
                  <div className={`${styles.skeleton} ${styles.skelKpi}`} />
                </div>
              ))}
            </section>
            <section className={styles.card}>
              <div className={`${styles.skeleton} ${styles.chart}`} />
            </section>
            <div className={styles.split}>
              {[0, 1].map((i) => (
                <section key={i} className={styles.card}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className={`${styles.skeleton} ${styles.skelRow}`} />
                  ))}
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const { kpis } = data;
  const monthDelta =
    kpis.revenueLastMonth > 0 ? (kpis.revenueThisMonth - kpis.revenueLastMonth) / kpis.revenueLastMonth : null;
  const pipelineTotal = pipelineByStage.reduce((s, p) => s + p.value, 0);
  const visibleDeals =
    stageFilter === "all" ? data.openDeals : data.openDeals.filter((d) => d.stage === stageFilter);

  return (
    <div className={styles.page}>
      {header}

      <section className={styles.kpis}>
        <div className={`${styles.kpi} ${styles.kpiLead}`}>
          <div className={styles.kpiLabel}>Revenue · month to date</div>
          <div className={styles.kpiValue}>{money(kpis.revenueThisMonth)}</div>
          {monthDelta !== null && (
            <div className={monthDelta >= 0 ? styles.deltaUp : styles.deltaDown}>
              {monthDelta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(monthDelta * 100).toFixed(1)}% vs all of last month
            </div>
          )}
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Revenue YTD</div>
          <div className={styles.kpiValue}>{compactMoney(kpis.revenueYtd)}</div>
          <div className={styles.kpiSub}>Closed-won, calendar year</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Open pipeline</div>
          <div className={styles.kpiValue}>{compactMoney(kpis.openPipelineValue)}</div>
          <div className={styles.kpiSub}>{kpis.openDealCount} deals in progress</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Win rate</div>
          <div className={styles.kpiValue}>
            {kpis.winRate === null ? "—" : `${Math.round(kpis.winRate * 100)}%`}
          </div>
          <div className={styles.kpiSub}>Won ÷ closed, last 90 days</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>New leads</div>
          <div className={styles.kpiValue}>{kpis.newLeads30d}</div>
          <div className={styles.kpiSub}>Last 30 days</div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Monthly revenue</h2>
          <span className={styles.cardMeta}>Trailing 12 months · closed-won</span>
        </div>
        <div className={styles.chart}>
          <ResponsiveContainer>
            <AreaChart data={data.monthlyRevenue} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-color-1)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--chart-color-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickFormatter={(v: number) => compactMoney(v)}
              />
              <Tooltip cursor={{ stroke: "var(--border)" }} content={<RevenueTooltip />} />
              <Area
                dataKey="revenue"
                type="monotone"
                stroke="var(--chart-color-1)"
                strokeWidth={2}
                fill="url(#revFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className={styles.split}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Deals in progress</h2>
            <span className={styles.cardMeta}>{money(pipelineTotal)} open</span>
          </div>

          <div className={styles.stageBar} aria-label="Pipeline by stage">
            {pipelineByStage.map((p) =>
              p.value > 0 ? (
                <div
                  key={p.stage}
                  className={`${styles.stageSeg} ${styles[`seg_${p.stage}`]}`}
                  style={{ flexGrow: p.value }}
                  title={`${STAGE_LABEL[p.stage]}: ${money(p.value)}`}
                />
              ) : null,
            )}
          </div>
          <div className={styles.stageLegend}>
            {pipelineByStage.map((p) => (
              <div key={p.stage} className={styles.stageLegendItem}>
                <span className={`${styles.dot} ${styles[`seg_${p.stage}`]}`} />
                <span>{STAGE_LABEL[p.stage]}</span>
                <span className={styles.num}>{p.count}</span>
                <span className={styles.stageLegendValue}>{compactMoney(p.value)}</span>
              </div>
            ))}
          </div>

          <div className={styles.tabs} role="tablist" aria-label="Filter deals by stage">
            {(["all", ...STAGE_ORDER] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={stageFilter === s}
                className={`${styles.tab} ${stageFilter === s ? styles.tabActive : ""}`}
                onClick={() => setStageFilter(s)}
              >
                {s === "all" ? "All" : STAGE_LABEL[s]}
              </button>
            ))}
          </div>

          <div className={styles.table}>
            <div className={`${styles.row} ${styles.rowHead} ${styles.dealRow}`}>
              <span>Deal</span>
              <span>Stage</span>
              <span>Close</span>
              <span className={styles.right}>Value</span>
            </div>
            {visibleDeals.length === 0 && <div className={styles.empty}>No deals in this stage.</div>}
            {visibleDeals.map((d) => (
              <div key={d.id} className={`${styles.row} ${styles.dealRow}`}>
                <div className={styles.primaryCell}>
                  <span className={styles.primaryText}>{d.clientName}</span>
                  <span className={styles.secondaryText}>
                    {d.name} · {d.owner}
                  </span>
                </div>
                <span className={styles.stageLabel}>
                  <span className={`${styles.dot} ${styles[`seg_${d.stage}`]}`} />
                  {STAGE_LABEL[d.stage]}
                </span>
                <span className={styles.mono}>{d.expectedCloseDate ? shortDate(d.expectedCloseDate) : "—"}</span>
                <span className={`${styles.num} ${styles.right}`}>{money(d.value)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Recent leads</h2>
            <span className={styles.cardMeta}>Newest first</span>
          </div>
          <div className={styles.table}>
            {data.recentLeads.length === 0 && <div className={styles.empty}>No leads yet.</div>}
            {data.recentLeads.map((l) => (
              <div key={l.id} className={`${styles.row} ${styles.leadRow}`}>
                <div className={styles.primaryCell}>
                  <span className={styles.primaryText}>{l.name}</span>
                  <span className={styles.secondaryText}>
                    {l.company} · {SOURCE_LABEL[l.source] ?? l.source}
                  </span>
                </div>
                <div className={styles.leadMeta}>
                  <span className={`${styles.badge} ${STATUS_CLASS[l.status]}`}>{l.status}</span>
                  <span className={styles.mono}>{leadDate(l.createdAt)}</span>
                </div>
                <span className={`${styles.num} ${styles.right}`}>
                  {l.estimatedValue ? compactMoney(l.estimatedValue) : "—"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
