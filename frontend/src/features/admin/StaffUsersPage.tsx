import PageHeader from "@/shared/components/PageHeader";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/EditOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import SearchIcon from "@mui/icons-material/Search";
import WarningIcon from "@mui/icons-material/WarningAmberOutlined";

import type { AuthUser } from "@/features/auth/authSlice";
import {
  useDeleteUserMutation,
  useListFacultiesQuery,
  useListUsersQuery,
} from "@/features/admin/adminApi";
import { UserDialog } from "@/features/admin/UserDialog";
import {
  ROLE_COLORS,
  STAFF_ROLES,
  initials,
  type RoleName,
} from "@/features/admin/userMeta";

/**
 * Staff directory: everyone who works a queue.
 *
 * Split from students because the two groups share almost no columns — staff
 * are defined by role and faculty binding, students by group and course. The
 * faculty column matters here in particular: it is what routes incoming
 * requests to a registrator.
 */
/** The API's page ceiling; far above any university's staff headcount. */
const STAFF_PAGE = 500;

export default function StaffUsersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; user?: AuthUser } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AuthUser | null>(null);

  // One request per role: the API filters by a single role only. Staff
  // headcount is small, so one generous page per role covers everyone and the
  // page can keep filtering in memory.
  const r1 = useListUsersQuery({ role: "registrator", limit: STAFF_PAGE });
  const r2 = useListUsersQuery({ role: "staff", limit: STAFF_PAGE });
  const r3 = useListUsersQuery({ role: "admin", limit: STAFF_PAGE });
  const r4 = useListUsersQuery({ role: "leadership", limit: STAFF_PAGE });
  const registrators = useMemo(() => r1.data?.items ?? [], [r1.data]);
  const staff = useMemo(() => r2.data?.items ?? [], [r2.data]);
  const admins = useMemo(() => r3.data?.items ?? [], [r3.data]);
  const leadership = useMemo(() => r4.data?.items ?? [], [r4.data]);
  const { data: faculties = [] } = useListFacultiesQuery({ include_inactive: true });
  const [deleteUser] = useDeleteUserMutation();

  const isLoading = r1.isLoading || r2.isLoading || r3.isLoading || r4.isLoading;
  const error = r1.error || r2.error || r3.error || r4.error;

  const users = useMemo(
    () => [...registrators, ...staff, ...admins, ...leadership],
    [registrators, staff, admins, leadership],
  );

  const facultyName = useMemo(
    () => new Map(faculties.map((f) => [f.id, f.name])),
    [faculties],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    users.forEach((u) => {
      c[u.role.name] = (c[u.role.name] || 0) + 1;
    });
    return c;
  }, [users]);

  /**
   * Active faculties with no registrator bound cannot receive requests at
   * all, so the gap is surfaced here rather than discovered by a student
   * hitting a 409 on submit.
   */
  const unboundFaculties = useMemo(() => {
    const bound = new Set(
      registrators.filter((r) => r.is_active && r.faculty_id).map((r) => r.faculty_id),
    );
    return faculties.filter((f) => f.is_active && !bound.has(f.id));
  }, [registrators, faculties]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role.name !== roleFilter) return false;
      if (!q) return true;
      return (
        u.full_name.toLowerCase().includes(q) ||
        (u.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, search, roleFilter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id).unwrap();
      setDeleteTarget(null);
    } catch {
      /* ignore — the list refreshes via cache tags either way */
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      <PageHeader title={t("users.staffTitle")} subtitle={t("users.staffSubtitle")} action={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ mode: "create" })}>
          {t("users.newStaff")}
        </Button>
      } />

      {unboundFaculties.length > 0 && (
        <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 3 }}>
          {t("users.unboundFaculties", {
            names: unboundFaculties.map((f) => f.name).join(", "),
          })}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          mb: 3,
          gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
        }}
      >
        {STAFF_ROLES.map((r) => (
          <Card key={r}>
            <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
              <Typography variant="h5" fontWeight={600} sx={{ color: ROLE_COLORS[r] }}>
                {counts[r] || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t(`role.${r}`)}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              size="small"
              placeholder={t("users.searchStaffPlaceholder")}
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
              label={t("users.roleFilter")}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="">{t("users.allRoles")}</MenuItem>
              {STAFF_ROLES.map((r) => (
                <MenuItem key={r} value={r}>
                  {t(`role.${r}`)}
                </MenuItem>
              ))}
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
                <TableCell>{t("users.columns.role")}</TableCell>
                <TableCell>{t("users.columns.faculty")}</TableCell>
                <TableCell>{t("users.columns.contact")}</TableCell>
                <TableCell align="center">{t("users.columns.active")}</TableCell>
                <TableCell align="right">{t("users.columns.actions")}</TableCell>
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
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">{t("users.noResults")}</Typography>
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Avatar
                        src={u.image_path || undefined}
                        sx={{
                          width: 38,
                          height: 38,
                          fontSize: 14,
                          fontWeight: 700,
                          bgcolor: ROLE_COLORS[u.role.name as RoleName] || "#64748B",
                        }}
                      >
                        {initials(u.full_name)}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {u.full_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          ID: {u.id}
                        </Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={t(`role.${u.role.name}`)}
                      size="small"
                      sx={{
                        bgcolor: (ROLE_COLORS[u.role.name as RoleName] || "#64748B") + "15",
                        color: ROLE_COLORS[u.role.name as RoleName] || "#64748B",
                        fontWeight: 600,
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {u.faculty_id ? (
                      <Typography variant="body2" noWrap>
                        {facultyName.get(u.faculty_id) ?? `#${u.faculty_id}`}
                      </Typography>
                    ) : (
                      // A registrator without a faculty receives nothing, so
                      // the gap is called out rather than shown as a dash.
                      <Chip
                        size="small"
                        variant="outlined"
                        color={u.role.name === "registrator" ? "warning" : "default"}
                        label={t("users.noFaculty")}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>
                      {u.email || "—"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {u.phone || "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={u.is_active ? t("common.yes") : t("common.no")}
                      size="small"
                      color={u.is_active ? "success" : "default"}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={t("common.edit")}>
                      <IconButton size="small" onClick={() => setDialog({ mode: "edit", user: u })}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("users.deactivate")}>
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={!u.is_active}
                          onClick={() => setDeleteTarget(u)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {dialog && (
        <UserDialog
          mode={dialog.mode}
          user={dialog.user}
          onClose={() => setDialog(null)}
          roleOptions={STAFF_ROLES}
          defaultRole="staff"
        />
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t("users.deactivate")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t("users.deactivateConfirm", { name: deleteTarget?.full_name })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            {t("users.deactivate")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
