import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Card,
  CardContent,
  Chip,
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
import HistoryIcon from "@mui/icons-material/History";

import { useListAuditQuery } from "@/features/admin/adminApi";

const ACTION_COLORS: Record<string, string> = {
  create: "#10B981",
  update: "#3B82F6",
  delete: "#EF4444",
  deactivate: "#EF4444",
  login: "#8B5CF6",
  assign: "#F59E0B",
  transition: "#6366F1",
};

function actionColor(action: string): string {
  const key = Object.keys(ACTION_COLORS).find((k) => action.toLowerCase().includes(k));
  return key ? ACTION_COLORS[key] : "#64748B";
}

export default function AuditPage() {
  const { t } = useTranslation();
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");

  const { data: logs = [], isLoading } = useListAuditQuery({
    entity_type: entityType || undefined,
    action: action || undefined,
    limit: 200,
  });

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            {t("nav.audit")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("audit.subtitle")}
          </Typography>
        </Box>
      </Stack>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              size="small"
              select
              label={t("audit.entityType")}
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">—</MenuItem>
              <MenuItem value="user">User</MenuItem>
              <MenuItem value="request">Request</MenuItem>
              <MenuItem value="category">Category</MenuItem>
              <MenuItem value="faculty">Faculty</MenuItem>
            </TextField>
            <TextField
              size="small"
              label={t("audit.action")}
              placeholder="user.create"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              sx={{ minWidth: 200 }}
            />
          </Stack>
        </CardContent>
      </Card>

      <TableContainer component={Paper} sx={{ border: "1px solid", borderColor: "divider" }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: "background.default" }}>
              <TableCell>{t("audit.columns.time")}</TableCell>
              <TableCell>{t("audit.columns.actor")}</TableCell>
              <TableCell>{t("audit.columns.action")}</TableCell>
              <TableCell>{t("audit.columns.entity")}</TableCell>
              <TableCell>{t("audit.columns.changes")}</TableCell>
              <TableCell>{t("audit.columns.ip")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">{t("common.loading")}</Typography>
                </TableCell>
              </TableRow>
            )}
            {!isLoading && logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <Stack alignItems="center" spacing={1}>
                    <HistoryIcon sx={{ fontSize: 48, color: "text.disabled" }} />
                    <Typography color="text.secondary">{t("audit.empty")}</Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            )}
            {logs.map((log) => (
              <TableRow key={log.id} hover>
                <TableCell>
                  <Typography variant="caption">
                    {new Date(log.created_at).toLocaleString("uz-UZ")}
                  </Typography>
                </TableCell>
                <TableCell>
                  {log.user_id ? (
                    <Typography variant="body2">#{log.user_id}</Typography>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      system
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    label={log.action}
                    size="small"
                    sx={{
                      bgcolor: actionColor(log.action) + "15",
                      color: actionColor(log.action),
                      fontWeight: 600,
                      fontFamily: "monospace",
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {log.entity_type}
                    {log.entity_id && (
                      <Typography component="span" color="text.secondary" ml={0.5}>
                        #{log.entity_id}
                      </Typography>
                    )}
                  </Typography>
                </TableCell>
                <TableCell sx={{ maxWidth: 300 }}>
                  {log.new_value && (
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: "monospace",
                        bgcolor: "grey.100",
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        wordBreak: "break-word",
                      }}
                    >
                      {JSON.stringify(log.new_value)}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {log.ip_address || "—"}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
