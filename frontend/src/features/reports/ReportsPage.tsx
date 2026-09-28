import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";

import {
  useDownloadKpiReportMutation,
  useGetKpiReportQuery,
  type KpiGroupBy,
  type KpiRow,
} from "@/features/reports/reportsApi";
import { formatApiError } from "@/shared/api/errors";

/** Reglament 8.2: SLA compliance target for staff. */
const SLA_TARGET_PCT = 90;

const GROUPS: KpiGroupBy[] = ["staff", "faculty", "department", "service_type"];

function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmt(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value}${suffix}`;
}

/**
 * Monthly KPI report (Reglament 8-bob), for leadership and administrators.
 *
 * One table per cut — staff member, faculty, department, service type — over a
 * chosen period, with the same numbers downloadable as an Excel workbook.
 */
export default function ReportsPage() {
  const { t } = useTranslation();
  const today = new Date();
  const [groupBy, setGroupBy] = useState<KpiGroupBy>("staff");
  const [dateFrom, setDateFrom] = useState(isoDay(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [dateTo, setDateTo] = useState(isoDay(today));
  const [downloadErr, setDownloadErr] = useState<string | null>(null);

  const params = { group_by: groupBy, date_from: dateFrom, date_to: dateTo };
  const { data, isLoading, isFetching, error } = useGetKpiReportQuery(params, {
    skip: !dateFrom || !dateTo,
  });
  const [download, downloadState] = useDownloadKpiReportMutation();

  const handleDownload = async () => {
    setDownloadErr(null);
    try {
      const url = await download(params).unwrap();
      const a = document.createElement("a");
      a.href = url;
      a.download = `royd-kpi-${groupBy}-${dateFrom}-${dateTo}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e: unknown) {
      setDownloadErr(formatApiError(e, t("common.error")));
    }
  };

  return (
    <Box>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ md: "center" }}
        spacing={2}
        mb={3}
      >
        <Box>
          <Typography variant="h4" fontWeight={600}>
            {t("reports.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("reports.subtitle")}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          disabled={downloadState.isLoading || !data}
        >
          {t("reports.downloadExcel")}
        </Button>
      </Stack>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
            <TextField
              size="small"
              type="date"
              label={t("reports.from")}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              type="date"
              label={t("reports.to")}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <Tabs
              value={groupBy}
              onChange={(_e, v) => setGroupBy(v)}
              variant="scrollable"
              allowScrollButtonsMobile
              sx={{ minHeight: 40, "& .MuiTab-root": { minHeight: 40 } }}
            >
              {GROUPS.map((g) => (
                <Tab key={g} value={g} label={t(`reports.groupBy.${g}`)} />
              ))}
            </Tabs>
          </Stack>
        </CardContent>
      </Card>

      {downloadErr && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {downloadErr}
        </Alert>
      )}

      {error ? (
        <Alert severity="error">{formatApiError(error, t("common.error"))}</Alert>
      ) : (
        <TableContainer
          component={Paper}
          sx={{ border: "1px solid", borderColor: "divider", overflowX: "auto" }}
        >
          <Table size="small" sx={{ opacity: isFetching ? 0.6 : 1 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: "background.default" }}>
                <TableCell>{t(`reports.groupBy.${groupBy}`)}</TableCell>
                <TableCell align="right">{t("reports.cols.total")}</TableCell>
                <TableCell align="right">{t("reports.cols.open")}</TableCell>
                <TableCell align="right">{t("reports.cols.completed")}</TableCell>
                <TableCell align="right">{t("reports.cols.rejected")}</TableCell>
                <TableCell align="right">{t("reports.cols.overdue")}</TableCell>
                <TableCell align="right">{t("reports.cols.sla")}</TableCell>
                <TableCell align="right">{t("reports.cols.rejectionRate")}</TableCell>
                <TableCell align="right">{t("reports.cols.returnedRate")}</TableCell>
                <TableCell align="right">{t("reports.cols.acceptHours")}</TableCell>
                <TableCell align="right">{t("reports.cols.resolveHours")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading &&
                [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={11}>
                      <Skeleton height={28} />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && data && data.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">{t("reports.empty")}</Typography>
                  </TableCell>
                </TableRow>
              )}
              {data?.rows.map((row) => <ReportRow key={row.key ?? "none"} row={row} />)}
              {data && data.rows.length > 0 && <ReportRow row={data.totals} bold />}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
        {t("reports.footnote", { target: SLA_TARGET_PCT })}
      </Typography>
    </Box>
  );
}

function ReportRow({ row, bold }: { row: KpiRow; bold?: boolean }) {
  const weight = bold ? 700 : undefined;
  const sla = row.sla_compliance_pct;
  return (
    <TableRow hover={!bold} sx={bold ? { bgcolor: "background.default" } : undefined}>
      <TableCell sx={{ fontWeight: weight, maxWidth: 320 }}>{row.label}</TableCell>
      <TableCell align="right" sx={{ fontWeight: weight }}>
        {row.total}
      </TableCell>
      <TableCell align="right" sx={{ fontWeight: weight }}>
        {row.open}
      </TableCell>
      <TableCell align="right" sx={{ fontWeight: weight }}>
        {row.completed}
      </TableCell>
      <TableCell align="right" sx={{ fontWeight: weight }}>
        {row.rejected}
      </TableCell>
      <TableCell
        align="right"
        sx={{ fontWeight: weight, color: row.overdue_open ? "error.main" : undefined }}
      >
        {row.overdue_open}
      </TableCell>
      <TableCell align="right">
        {sla === null ? (
          "—"
        ) : (
          <Chip
            size="small"
            label={`${sla}%`}
            color={sla >= SLA_TARGET_PCT ? "success" : "warning"}
            variant={bold ? "filled" : "outlined"}
          />
        )}
      </TableCell>
      <TableCell align="right" sx={{ fontWeight: weight }}>
        {fmt(row.rejection_pct, "%")}
      </TableCell>
      <TableCell align="right" sx={{ fontWeight: weight }}>
        {fmt(row.returned_pct, "%")}
      </TableCell>
      <TableCell align="right" sx={{ fontWeight: weight }}>
        {fmt(row.avg_accept_hours)}
      </TableCell>
      <TableCell align="right" sx={{ fontWeight: weight }}>
        {fmt(row.avg_resolution_hours)}
      </TableCell>
    </TableRow>
  );
}
