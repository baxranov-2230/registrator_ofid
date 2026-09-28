import PageHeader from "@/shared/components/PageHeader";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Avatar,
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
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

import {
  useListFacultiesQuery,
  useListUsersQuery,
} from "@/features/admin/adminApi";
import { ROLE_COLORS, initials } from "@/features/admin/userMeta";

/**
 * Student directory.
 *
 * Read-only by design: student records are owned by HEMIS and synced on login,
 * so editing them here would be overwritten on the student's next sign-in.
 * The columns are the HEMIS ones an administrator actually looks people up by —
 * group, course, faculty — none of which apply to staff.
 */
export default function StudentUsersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [facultyFilter, setFacultyFilter] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const debouncedSearch = useDebounced(search.trim());
  // Filtering and paging run on the server: downloading every student to
  // filter in the browser stopped scaling long before the directory was full.
  const { data, isLoading, isFetching, error } = useListUsersQuery({
    role: "student",
    limit: rowsPerPage,
    offset: page * rowsPerPage,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(facultyFilter ? { faculty_id: Number(facultyFilter) } : {}),
    ...(activeFilter ? { is_active: activeFilter === "1" } : {}),
  });
  const visible = data?.items ?? [];
  const total = data?.total ?? 0;
  // The summary counters are just totals of two narrow queries.
  const { data: allStudents } = useListUsersQuery({ role: "student", limit: 1 });
  const { data: activeStudents } = useListUsersQuery({
    role: "student",
    is_active: true,
    limit: 1,
  });
  const { data: faculties = [] } = useListFacultiesQuery({ include_inactive: true });

  useEffect(() => setPage(0), [debouncedSearch]);

  const facultyName = useMemo(
    () => new Map(faculties.map((f) => [f.id, f.name])),
    [faculties],
  );

  // The list includes retired faculties so old records resolve their name, but
  // the counter and the filter should only offer the ones still in use.
  const activeFaculties = useMemo(() => faculties.filter((f) => f.is_active), [faculties]);
  const activeFacultyCount = activeFaculties.length;

  const resetPage = () => setPage(0);

  return (
    <Box sx={{ width: "100%" }}>
      <PageHeader title={t("users.studentsTitle")} subtitle={t("users.studentsSubtitle")} />

      {/* Students arrive through HEMIS, so there is no "add" button here. */}
      <Alert severity="info" sx={{ mb: 3 }}>
        {t("users.studentsHemisNote")}
      </Alert>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          mb: 3,
          gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
        }}
      >
        <SummaryCard label={t("users.totalStudents")} value={allStudents?.total ?? 0} color="#25A194" />
        <SummaryCard
          label={t("users.activeStudents")}
          value={activeStudents?.total ?? 0}
          color="#15803D"
        />
        <SummaryCard label={t("nav.faculties")} value={activeFacultyCount} color="#2D57FE" />
      </Box>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              size="small"
              placeholder={t("users.searchStudentPlaceholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
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
              label={t("users.columns.faculty")}
              value={facultyFilter}
              onChange={(e) => {
                setFacultyFilter(e.target.value);
                resetPage();
              }}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="">{t("requests.filterAll")}</MenuItem>
              {activeFaculties.map((f) => (
                <MenuItem key={f.id} value={String(f.id)}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              select
              label={t("users.columns.active")}
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value);
                resetPage();
              }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">{t("requests.filterAll")}</MenuItem>
              <MenuItem value="1">{t("common.yes")}</MenuItem>
              <MenuItem value="0">{t("common.no")}</MenuItem>
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      {error ? (
        <Alert severity="error">{t("common.error")}</Alert>
      ) : (
        <TableContainer
          component={Paper}
          sx={{ border: "1px solid", borderColor: "divider", overflowX: "auto" }}
        >
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: "background.default" }}>
                <TableCell>{t("users.columns.user")}</TableCell>
                <TableCell>{t("users.columns.studentId")}</TableCell>
                <TableCell>{t("users.columns.faculty")}</TableCell>
                <TableCell>{t("users.columns.group")}</TableCell>
                <TableCell align="center">{t("users.columns.level")}</TableCell>
                <TableCell align="center">{t("users.columns.active")}</TableCell>
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
              {!isLoading && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">{t("users.noResults")}</Typography>
                  </TableCell>
                </TableRow>
              )}
              {visible.map((u) => (
                <TableRow key={u.id} hover sx={{ opacity: isFetching ? 0.6 : 1 }}>
                  <TableCell>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Avatar
                        src={u.image_path || undefined}
                        sx={{
                          width: 38,
                          height: 38,
                          fontSize: 14,
                          fontWeight: 700,
                          bgcolor: ROLE_COLORS.student,
                        }}
                      >
                        {initials(u.full_name)}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {u.full_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {u.specialty || "—"}
                        </Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    >
                      {u.external_student_id || "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>
                      {u.faculty_id ? facultyName.get(u.faculty_id) ?? `#${u.faculty_id}` : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>
                      {u.group_name || "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">{u.level ?? "—"}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={u.is_active ? t("common.yes") : t("common.no")}
                      size="small"
                      color={u.is_active ? "success" : "default"}
                      variant="outlined"
                    />
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
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              resetPage();
            }}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage={t("common.rowsPerPage")}
          />
        </TableContainer>
      )}
    </Box>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Typography variant="h5" fontWeight={600} sx={{ color }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </CardContent>
    </Card>
  );
}

/** Debounce the search box so each keystroke is not a request. */
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
