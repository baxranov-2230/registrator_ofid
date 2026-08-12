import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

import type { AuthUser } from "@/features/auth/authSlice";
import {
  useCreateUserMutation,
  useListFacultiesQuery,
  useUpdateUserMutation,
} from "@/features/admin/adminApi";
import { formatApiError } from "@/shared/api/errors";
import { ROLES, type RoleName } from "@/features/admin/userMeta";

export function UserDialog({
  mode,
  user,
  onClose,
  roleOptions = ROLES,
  defaultRole = "student",
}: {
  mode: "create" | "edit";
  user?: AuthUser;
  onClose: () => void;
  /** Narrowed by the caller so each page only offers roles it manages. */
  roleOptions?: readonly RoleName[];
  defaultRole?: RoleName;
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
    role_name: user?.role.name || defaultRole,
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
              {roleOptions.map((r) => (
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
