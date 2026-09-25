export type OpenDealStage = "qualified" | "proposal" | "negotiation";
export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified";
export type LeadSource = "referral" | "website" | "linkedin" | "event" | "cold_outreach";

/** Response of GET /api/dashboard. Dates are ISO strings (expectedCloseDate is YYYY-MM-DD). */
export type DashboardData = {
  kpis: {
    revenueThisMonth: number;
    revenueLastMonth: number;
    revenueYtd: number;
    openPipelineValue: number;
    openDealCount: number;
    winRate: number | null;
    newLeads30d: number;
  };
  monthlyRevenue: { month: string; revenue: number }[];
  openDeals: {
    id: number;
    name: string;
    clientName: string;
    value: number;
    stage: OpenDealStage;
    owner: string;
    expectedCloseDate: string | null;
  }[];
  recentLeads: {
    id: number;
    name: string;
    company: string;
    source: LeadSource;
    status: LeadStatus;
    estimatedValue: number | null;
    createdAt: string;
  }[];
};
