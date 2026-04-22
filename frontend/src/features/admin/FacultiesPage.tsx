import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SchoolIcon from "@mui/icons-material/SchoolOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import {
  useCreateFacultyMutation,
  useListDepartmentsQuery,
  useListFacultiesQuery,
} from "@/features/admin/adminApi";

export default function FacultiesPage() {
  const { t } = useTranslation();
  const { data: faculties = [], isLoading } = useListFacultiesQuery();
  const { data: departments = [] } = useListDepartmentsQuery();
  const [open, setOpen] = useState(false);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            {t("nav.faculties")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("faculties.subtitle")}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          {t("faculties.newFaculty")}
        </Button>
      </Stack>

      <Alert severity="info" icon={<AutoAwesomeIcon />} sx={{ mb: 3 }}>
        {t("faculties.autoHint")}
      </Alert>

      {isLoading ? (
        <Typography color="text.secondary">{t("common.loading")}</Typography>
      ) : faculties.length === 0 ? (
        <Card>
          <CardContent sx={{ py: 8, textAlign: "center" }}>
            <Typography color="text.secondary">{t("faculties.empty")}</Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {faculties.map((f) => {
            const facDepts = departments.filter((d) => d.faculty_id === f.id);
            return (
              <Grid item xs={12} md={6} lg={4} key={f.id}>
                <Card sx={{ height: "100%" }}>
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="flex-start" mb={2}>
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: 2,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
                          color: "white",
                        }}
                      >
                        <SchoolIcon />
                      </Box>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" fontWeight={700}>
                          {f.name}
                        </Typography>
                        <Stack direction="row" spacing={0.5} mt={0.5} alignItems="center">
                          <Chip label={f.code} size="small" />
                          {f.hemis_id && (
                            <Tooltip title={t("faculties.fromHemis")}>
                              <Chip
                                icon={<AutoAwesomeIcon sx={{ fontSize: 12 }} />}
                                label="HEMIS"
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            </Tooltip>
                          )}
                        </Stack>
                      </Box>
                    </Stack>
                    {f.contact_email && (
                      <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                        {f.contact_email}
                      </Typography>
                    )}
                    {facDepts.length > 0 && (
                      <Box mt={2}>
                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                          {t("faculties.departments")} ({facDepts.length})
                        </Typography>
                        <Stack direction="row" spacing={0.5} mt={1} flexWrap="wrap" useFlexGap>
                          {facDepts.map((d) => (
                            <Chip key={d.id} label={d.name} size="small" variant="outlined" />
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {open && <FacultyDialog onClose={() => setOpen(false)} />}
    </Box>
  );
}

function FacultyDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [create, state] = useCreateFacultyMutation();
  const [form, setForm] = useState({ name: "", code: "", contact_email: "" });
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await create({
        name: form.name,
        code: form.code.toUpperCase(),
        contact_email: form.contact_email || null,
      }).unwrap();
      onClose();
    } catch (e: unknown) {
      const data = (e as { data?: { detail?: string } }).data;
      setErr(data?.detail || t("common.error"));
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{t("faculties.newFaculty")}</DialogTitle>
        <DialogContent>
          {err && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {err}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("faculties.form.name")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              fullWidth
            />
            <TextField
              label={t("faculties.form.code")}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              required
              fullWidth
              helperText={t("faculties.form.codeHint")}
            />
            <TextField
              label={t("faculties.form.email")}
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="contained" disabled={state.isLoading}>
            {t("common.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
