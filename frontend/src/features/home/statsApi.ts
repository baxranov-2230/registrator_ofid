import { api } from "@/shared/api/base";
import type { RequestStatus } from "@/features/requests/requestsApi";

/** Role-scoped dashboard counters from GET /stats/dashboard (C-01). */
export interface DashboardStats {
  total: number;
  open: number;
  by_status: Record<RequestStatus, number>;
  overdue: number;
  due_soon: number;
  completed_today: number;
  created_this_week: number;
  avg_resolution_hours: number | null;
  sla_compliance_pct: number | null;
  /** Admin and leadership only. */
  total_users?: number | null;
  unassigned?: number | null;
}

export const statsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getDashboardStats: build.query<DashboardStats, void>({
      query: () => "/stats/dashboard",
      providesTags: [{ type: "Stats", id: "DASHBOARD" }],
    }),
  }),
});

export const { useGetDashboardStatsQuery } = statsApi;
