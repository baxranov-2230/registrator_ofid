import { useMemo, useState } from "react";
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
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

import type {
  RequestStatus,
  RequestSummary,
} from "@/features/requests/requestsApi";
import { useListRequestsQuery } from "@/features/requests/requestsApi";
import { STATUS_COLOR, STATUS_ORDER } from "@/features/requests/statusMeta";

interface Props {
  title: string;
  subtitle: string;
  detailBasePath: string;
  showAssignee?: boolean;
  unassignedFilter?: boolean;
  emptyHint?: string;
}

export default function RequestsList({
  title,
  subtitle,
  detailBasePath,
  showAssignee,
  unassignedFilter,
  emptyHint,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  const { data = [], isLoading, error } = useListRequestsQuery(
    status ? { status: status as RequestStatus } : undefined,
  );

  const filtered = useMemo(() => {
    let list: RequestSummary[] = data;
    if (onlyUnassigned) list = list.filter((r) => r.assigned_to == null);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.tracking_no.toLowerCase().includes(q),
      );
    }
    return list;
  }, [data, onlyUnassigned, search]);

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
            {unassignedFilter && (
              <TextField
                size="small"
                select
                label={t("requests.onlyUnassigned")}
                value={onlyUnassigned ? "1" : ""}
                onChange={(e) => setOnlyUnassigned(e.target.value === "1")}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">{t("common.no")}</MenuItem>
                <MenuItem value="1">{t("common.yes")}</MenuItem>
              </TextField>
            )}
          </Stack>
        </CardContent>
      </Card>

      {error ? (
        <Alert severity="error">{t("common.error")}</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ border: "1px solid", borderColor: "divider" }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: "background.default" }}>
                <TableCell>{t("requests.trackingNo")}</TableCell>
                <TableCell>{t("requests.title")}</TableCell>
                <TableCell>{t("requests.status.new")}</TableCell>
                {showAssignee && <TableCell>{t("requests.assignee")}</TableCell>}
                <TableCell>{t("requests.createdAtLabel")}</TableCell>
                <TableCell>{t("requests.sla")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={showAssignee ? 6 : 5} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">{t("common.loading")}</Typography>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={showAssignee ? 6 : 5} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      {emptyHint || t("requests.noRequests")}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  hover
                  sx={{ cursor: "pointer" }}
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
                        <Typography variant="body2">#{r.assigned_to}</Typography>
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
                    <Typography variant="body2" color="text.secondary">
                      {new Date(r.sla_deadline).toLocaleString()}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
