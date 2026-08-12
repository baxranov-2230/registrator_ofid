import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  InputAdornment,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

import type { RequestListParams, RequestStatus } from "@/features/requests/requestsApi";
import {
  useListAssigneesQuery,
  useListRequestsQuery,
} from "@/features/requests/requestsApi";
import { STATUS_COLOR, STATUS_ORDER } from "@/features/requests/statusMeta";
import { formatApiError } from "@/shared/api/errors";

interface Props {
  title: string;
  subtitle: string;
  detailBasePath: string;
  showAssignee?: boolean;
  /** Offer the extra "unassigned / overdue" filter — triage views only. */
  triageFilters?: boolean;
  emptyHint?: string;
}

/** Debounce the search box so each keystroke isn't a request. */
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function RequestsList({
  title,
  subtitle,
  detailBasePath,
  showAssignee,
  triageFilters,
  emptyHint,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  /** "" | "unassigned" | "overdue" — one extra triage lens at a time. */
  const [lens, setLens] = useState<string>("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const debouncedSearch = useDebounced(search);

  // Filtering and paging now happen server-side, so the table is correct for
  // any number of rows rather than only the first page the API happened to send.
  const params: RequestListParams = {
    limit: rowsPerPage,
    offset: page * rowsPerPage,
    ...(status ? { status: status as RequestStatus } : {}),
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
    ...(lens === "overdue" ? { overdue: true } : {}),
    ...(lens === "unassigned" ? { unassigned: true } : {}),
  };

  const { data, isLoading, isFetching, error } = useListRequestsQuery(params);
  const { data: assignees = [] } = useListAssigneesQuery(undefined, { skip: !showAssignee });

  const assigneeNames = useMemo(
    () => new Map(assignees.map((a) => [a.id, a.full_name])),
    [assignees],
  );

  // Any filter change invalidates the current page number.
  useEffect(() => setPage(0), [status, debouncedSearch, lens, rowsPerPage]);

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const colSpan = showAssignee ? 7 : 6;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>
      </Stack>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              size="small"
              placeholder={t("common.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flexGrow: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              size="small"
              select
              label={t("requests.filterByStatus")}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="">{t("requests.allStatuses")}</MenuItem>
              {STATUS_ORDER.map((s) => (
                <MenuItem key={s} value={s}>
                  {t(`requests.status.${s}`)}
                </MenuItem>
              ))}
            </TextField>
            {triageFilters && (
              <TextField
                size="small"
                select
                label={t("requests.filterExtra")}
                value={lens}
                onChange={(e) => setLens(e.target.value)}
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="">{t("requests.filterAll")}</MenuItem>
                <MenuItem value="unassigned">{t("requests.unassignedOnly")}</MenuItem>
                <MenuItem value="overdue">{t("requests.overdueOnly")}</MenuItem>
              </TextField>
            )}
          </Stack>
        </CardContent>
      </Card>

      {error ? (
        <Alert severity="error">{formatApiError(error, t("common.error"))}</Alert>
      ) : (
        <TableContainer
          component={Paper}
          sx={{ border: "1px solid", borderColor: "divider", overflowX: "auto" }}
        >
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: "background.default" }}>
                <TableCell>{t("requests.trackingNo")}</TableCell>
                <TableCell>{t("requests.title")}</TableCell>
                <TableCell>{t("requests.statusLabel")}</TableCell>
                {showAssignee && <TableCell>{t("requests.assignee")}</TableCell>}
                <TableCell>{t("requests.createdAtLabel")}</TableCell>
                <TableCell>{t("requests.sla")}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading &&
                [0, 1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={colSpan}>
                      <Skeleton height={28} />
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colSpan} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      {emptyHint || t("requests.noRequests")}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  hover
                  sx={{ cursor: "pointer", opacity: isFetching ? 0.6 : 1 }}
                  onClick={() => navigate(`${detailBasePath}/${r.id}`)}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {r.tracking_no}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ maxWidth: 420 }} noWrap>
                      {r.title}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={t(`requests.status.${r.status}`)}
                      size="small"
                      sx={{
                        bgcolor: STATUS_COLOR[r.status] + "15",
                        color: STATUS_COLOR[r.status],
                        fontWeight: 600,
                      }}
                    />
                  </TableCell>
                  {showAssignee && (
                    <TableCell>
                      {r.assigned_to ? (
                        <Typography variant="body2">
                          {assigneeNames.get(r.assigned_to) ?? `#${r.assigned_to}`}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.disabled">
                          {t("requests.notAssignedYet")}
                        </Typography>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(r.created_at).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      color={r.is_overdue ? "error.main" : "text.secondary"}
                      fontWeight={r.is_overdue ? 600 : 400}
                    >
                      {new Date(r.sla_deadline).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {r.is_overdue && (
                      <Chip
                        size="small"
                        color="error"
                        variant="outlined"
                        label={t("requests.overdue")}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_e, next) => setPage(next)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage={t("common.rowsPerPage")}
          />
        </TableContainer>
      )}
    </Box>
  );
}
