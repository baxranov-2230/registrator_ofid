import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import GroupIcon from "@mui/icons-material/Groups";
import SearchIcon from "@mui/icons-material/Search";

import {
  useListFacultiesQuery,
  useListGroupsQuery,
} from "@/features/admin/adminApi";

export default function GroupsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [facultyFilter, setFacultyFilter] = useState<string>("");

  const { data: faculties = [] } = useListFacultiesQuery();
  const { data: groups = [], isLoading } = useListGroupsQuery(
    facultyFilter ? { faculty_id: Number(facultyFilter) } : undefined,
  );

  const facMap = useMemo(() => {
    const m = new Map<number, string>();
    faculties.forEach((f) => m.set(f.id, f.name));
    return m;
  }, [faculties]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.specialty?.toLowerCase().includes(q) ||
        g.hemis_id?.toLowerCase().includes(q),
    );
  }, [groups, search]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            {t("groups.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("groups.subtitle")}
          </Typography>
        </Box>
      </Stack>

      <Alert severity="info" sx={{ mb: 3 }}>
        {t("groups.autoHint")}
      </Alert>

      <Stack direction="row" spacing={2} mb={3}>
        <Card sx={{ flex: 1, maxWidth: 260 }}>
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  bgcolor: "primary.main" + "15",
                  color: "primary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <GroupIcon />
              </Box>
              <Box>
                <Typography variant="h5" fontWeight={700}>
                  {groups.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("groups.total")}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              size="small"
              placeholder={t("groups.searchPlaceholder")}
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
              label={t("groups.facultyFilter")}
              value={facultyFilter}
              onChange={(e) => setFacultyFilter(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">{t("groups.allFaculties")}</MenuItem>
              {faculties.map((f) => (
                <MenuItem key={f.id} value={String(f.id)}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      <TableContainer component={Paper} sx={{ border: "1px solid", borderColor: "divider" }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: "background.default" }}>
              <TableCell>{t("groups.columns.name")}</TableCell>
              <TableCell>{t("groups.columns.faculty")}</TableCell>
              <TableCell>{t("groups.columns.specialty")}</TableCell>
              <TableCell>{t("groups.columns.year")}</TableCell>
              <TableCell>{t("groups.columns.hemisId")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">{t("common.loading")}</Typography>
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                  <Stack alignItems="center" spacing={1}>
                    <GroupIcon sx={{ fontSize: 48, color: "text.disabled" }} />
                    <Typography color="text.secondary">{t("groups.empty")}</Typography>
                    <Typography variant="caption" color="text.disabled">
                      {t("groups.emptyHint")}
                    </Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            )}
            {filtered.map((g) => (
              <TableRow key={g.id} hover>
                <TableCell>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 1.5,
                        bgcolor: "primary.main" + "10",
                        color: "primary.main",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <GroupIcon fontSize="small" />
                    </Box>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        {g.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ID: {g.id}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                  {g.faculty_id ? (
                    <Chip size="small" label={facMap.get(g.faculty_id) || `#${g.faculty_id}`} variant="outlined" />
                  ) : (
                    <Typography variant="caption" color="text.disabled">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{g.specialty || "—"}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {g.education_year || "—"}
                  </Typography>
                </TableCell>
                <TableCell>
                  {g.hemis_id ? (
                    <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                      {g.hemis_id}
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="text.disabled">
                      —
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
