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
  Switch,
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
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";

import type { AuthUser } from "@/features/auth/authSlice";
import {
  useCreateUserMutation,
  useDeleteUserMutation,
  useListFacultiesQuery,
  useListUsersQuery,
  useUpdateUserMutation,
} from "@/features/admin/adminApi";
import { formatApiError } from "@/shared/api/errors";

const ROLES = ["student", "registrator", "staff", "admin", "leadership"] as const;
type RoleName = (typeof ROLES)[number];

const ROLE_COLORS: Record<RoleName, string> = {
  admin: "#EF4444",
  leadership: "#8B5CF6",
  registrator: "#3B82F6",
  staff: "#10B981",
  student: "#64748B",
};

export default function UsersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; user?: AuthUser } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AuthUser | null>(null);

  const { data: users = [], isLoading, error } = useListUsersQuery(
    roleFilter ? { role: roleFilter } : undefined,
  );
  const [deleteUser, deleteState] = useDeleteUserMutation();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.external_student_id?.toLowerCase().includes(q),
    );
  }, [users, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    users.forEach((u) => {
      c[u.role.name] = (c[u.role.name] || 0) + 1;
    });
    return c;
  }, [users]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id).unwrap();
      setDeleteTarget(null);
    } catch {
      /* ignore — toast via tags later */
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            {t("nav.users")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("users.subtitle")}
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddIcon />}
          onClick={() => setDialog({ mode: "create" })}
        >
          {t("users.newUser")}
        </Button>
      </Stack>

      {/* Role summary chips */}
      <Stack direction="row" spacing={2} mb={3} flexWrap="wrap" useFlexGap>
        <Card sx={{ flex: 1, minWidth: 160 }}>
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
                <PeopleAltIcon />
              </Box>
              <Box>
                <Typography variant="h5" fontWeight={700}>
                  {users.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("users.totalUsers")}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
        {ROLES.map((r) => (
          <Card key={r} sx={{ flex: 1, minWidth: 140 }}>
            <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
              <Typography variant="h5" fontWeight={700} sx={{ color: ROLE_COLORS[r] }}>
                {counts[r] || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t(`role.${r}`)}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {/* Filters */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              size="small"
              placeholder={t("users.searchPlaceholder")}
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
              {ROLES.map((r) => (
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
        <TableContainer component={Paper} sx={{ border: "1px solid", borderColor: "divider" }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: "background.default" }}>
                <TableCell>{t("users.columns.user")}</TableCell>
                <TableCell>{t("users.columns.role")}</TableCell>
                <TableCell>{t("users.columns.contact")}</TableCell>
                <TableCell align="center">{t("users.columns.active")}</TableCell>
                <TableCell align="right">{t("users.columns.actions")}</TableCell>
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
                          {u.external_student_id && ` • ${u.external_student_id}`}
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
                    <Typography variant="body2" noWrap>
                      {u.email || "—"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {u.phone || "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {u.is_active ? (
                      <Chip label={t("common.yes")} size="small" color="success" variant="outlined" />
                    ) : (
                      <Chip label={t("common.no")} size="small" color="default" variant="outlined" />
                    )}
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
        />
      )}

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("users.deactivate")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t("users.deactivateConfirm", { name: deleteTarget?.full_name })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleteState.isLoading}>
            {t("users.deactivate")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function initials(name: string): string {
  return (name || "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function UserDialog({
  mode,
  user,
  onClose,
}: {
  mode: "create" | "edit";
  user?: AuthUser;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: faculties = [] } = useListFacultiesQuery();
  const [createUser, createState] = useCreateUserMutation();
  const [updateUser, updateState] = useUpdateUserMutation();

  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    password: "",
    role_name: user?.role.name || "student",
    faculty_id: user?.faculty_id ? String(user.faculty_id) : "",
    is_active: user?.is_active ?? true,
  });
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const loading = createState.isLoading || updateState.isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      if (mode === "create") {
        await createUser({
          full_name: form.full_name,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
          role_name: form.role_name,
          faculty_id: form.faculty_id ? Number(form.faculty_id) : null,
        }).unwrap();
      } else if (user) {
        await updateUser({
          id: user.id,
          data: {
            full_name: form.full_name,
            email: form.email,
            phone: form.phone || undefined,
            role_name: form.role_name,
            faculty_id: form.faculty_id ? Number(form.faculty_id) : null,
            is_active: form.is_active,
            ...(form.password ? { password: form.password } : {}),
          },
        }).unwrap();
      }
      onClose();
    } catch (e: unknown) {
      setErr(formatApiError(e, t("common.error")));
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{mode === "create" ? t("users.newUser") : t("users.editUser")}</DialogTitle>
        <DialogContent>
          {err && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {err}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("users.form.fullName")}
              value={form.full_name}
              onChange={set("full_name")}
              required
              fullWidth
            />
            <TextField
              label={t("users.form.email")}
              type="email"
              value={form.email}
              onChange={set("email")}
              required
              fullWidth
            />
            <TextField
              label={t("users.form.phone")}
              value={form.phone}
              onChange={set("phone")}
              fullWidth
            />
            <TextField
              label={mode === "create" ? t("users.form.password") : t("users.form.passwordChange")}
              type="password"
              value={form.password}
              onChange={set("password")}
              required={mode === "create"}
              fullWidth
              helperText={mode === "edit" ? t("users.form.passwordHint") : ""}
            />
            <TextField
              select
              label={t("users.form.role")}
              value={form.role_name}
              onChange={set("role_name")}
              required
              fullWidth
            >
              {ROLES.map((r) => (
                <MenuItem key={r} value={r}>
                  {t(`role.${r}`)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={t("users.form.faculty")}
              value={form.faculty_id}
              onChange={set("faculty_id")}
              fullWidth
            >
              <MenuItem value="">—</MenuItem>
              {faculties.map((f) => (
                <MenuItem key={f.id} value={String(f.id)}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
            {mode === "edit" && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Switch
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                <Typography variant="body2">{t("users.form.active")}</Typography>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {t("common.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
