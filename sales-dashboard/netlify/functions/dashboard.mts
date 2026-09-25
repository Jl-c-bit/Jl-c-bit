import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import type { DashboardData, OpenDealStage } from "../../src/types.ts";

export default async () => {
  try {
    const db = getDatabase();

    const [totalsRows, monthlyRows, openDeals, recentLeads, newLeadsRows] = await Promise.all([
      db.sql`
        SELECT
          coalesce(sum(value) FILTER (WHERE stage = 'won' AND closed_at >= date_trunc('month', now())), 0)::int AS "revenueThisMonth",
          coalesce(sum(value) FILTER (WHERE stage = 'won' AND closed_at >= date_trunc('month', now()) - interval '1 month'
                                        AND closed_at < date_trunc('month', now())), 0)::int AS "revenueLastMonth",
          coalesce(sum(value) FILTER (WHERE stage = 'won' AND closed_at >= date_trunc('year', now())), 0)::int AS "revenueYtd",
          count(*) FILTER (WHERE stage = 'won' AND closed_at >= now() - interval '90 days')::int AS "won90",
          count(*) FILTER (WHERE stage IN ('won', 'lost') AND closed_at >= now() - interval '90 days')::int AS "closed90"
        FROM deals`,
      db.sql`
        SELECT to_char(date_trunc('month', closed_at), 'YYYY-MM') AS ym, sum(value)::int AS revenue
        FROM deals
        WHERE stage = 'won' AND closed_at >= date_trunc('month', now()) - interval '11 months'
        GROUP BY 1`,
      db.sql`
        SELECT id, name, client_name AS "clientName", value, stage, owner,
               to_char(expected_close_date, 'YYYY-MM-DD') AS "expectedCloseDate"
        FROM deals
        WHERE stage IN ('qualified', 'proposal', 'negotiation')
        ORDER BY expected_close_date ASC NULLS LAST`,
      db.sql`
        SELECT id, name, company, source, status, estimated_value AS "estimatedValue", created_at AS "createdAt"
        FROM leads
        ORDER BY created_at DESC
        LIMIT 10`,
      db.sql`SELECT count(*)::int AS count FROM leads WHERE created_at >= now() - interval '30 days'`,
    ]);

    const totals = totalsRows[0] as {
      revenueThisMonth: number;
      revenueLastMonth: number;
      revenueYtd: number;
      won90: number;
      closed90: number;
    };

    // Fill all 12 trailing months, including months with no closed revenue.
    const byMonth = new Map((monthlyRows as { ym: string; revenue: number }[]).map((r) => [r.ym, r.revenue]));
    const now = new Date();
    const monthlyRevenue: DashboardData["monthlyRevenue"] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      monthlyRevenue.push({
        month: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
        revenue: byMonth.get(ym) ?? 0,
      });
    }

    const deals = openDeals as (DashboardData["openDeals"][number] & { stage: OpenDealStage })[];
    const body: DashboardData = {
      kpis: {
        revenueThisMonth: totals.revenueThisMonth,
        revenueLastMonth: totals.revenueLastMonth,
        revenueYtd: totals.revenueYtd,
        openPipelineValue: deals.reduce((s, d) => s + d.value, 0),
        openDealCount: deals.length,
        winRate: totals.closed90 > 0 ? totals.won90 / totals.closed90 : null,
        newLeads30d: (newLeadsRows[0] as { count: number }).count,
      },
      monthlyRevenue,
      openDeals: deals,
      recentLeads: recentLeads as DashboardData["recentLeads"],
    };

    return Response.json(body);
  } catch (error) {
    console.error("Failed to load dashboard", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/dashboard",
};
