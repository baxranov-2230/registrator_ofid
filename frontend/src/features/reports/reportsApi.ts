import { api } from "@/shared/api/base";

export type KpiGroupBy = "staff" | "faculty" | "department" | "service_type";

export interface KpiRow {
  key: number | null;
  label: string;
  total: number;
  open: number;
  completed: number;
  rejected: number;
  overdue_open: number;
  sla_compliance_pct: number | null;
  rejection_pct: number | null;
  returned_pct: number | null;
  avg_accept_hours: number | null;
  avg_resolution_hours: number | null;
}

export interface KpiReport {
  group_by: KpiGroupBy;
  date_from: string;
  date_to: string;
  rows: KpiRow[];
  totals: KpiRow;
}

export interface KpiParams {
  group_by: KpiGroupBy;
  date_from?: string;
  date_to?: string;
}

export const reportsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getKpiReport: build.query<KpiReport, KpiParams>({
      query: (params) => ({ url: "/reports/kpi", params }),
      providesTags: [{ type: "Stats", id: "KPI" }],
    }),
    /** Excel export, returned as an object URL (see downloadRequestFile). */
    downloadKpiReport: build.mutation<string, KpiParams>({
      query: (params) => ({
        url: "/reports/kpi.xlsx",
        params,
        responseHandler: async (response: Response) =>
          response.ok ? URL.createObjectURL(await response.blob()) : response.json(),
      }),
    }),
  }),
});

export const { useGetKpiReportQuery, useDownloadKpiReportMutation } = reportsApi;
