import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import { useListCategoriesQuery } from "@/features/admin/adminApi";
import {
  flattenCategories,
  useCreateRequestMutation,
} from "@/features/requests/requestsApi";

export default function NewRequestPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: catTree = [], isLoading: catsLoading } = useListCategoriesQuery();
  const [createRequest, createState] = useCreateRequestMutation();

  const [categoryId, setCategoryId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ id: number; tracking: string } | null>(
    null,
  );

  const categories = useMemo(() => flattenCategories(catTree), [catTree]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!categoryId) return setErr(t("requests.categoryRequired"));
    if (title.trim().length < 3) return setErr(t("requests.titleRequired"));
    if (description.trim().length < 3) return setErr(t("requests.descriptionRequired"));

    try {
      const res = await createRequest({
        category_id: Number(categoryId),
        title: title.trim(),
        description: description.trim(),
      }).unwrap();
      setSubmitted({ id: res.id, tracking: res.tracking_no });
    } catch (e: unknown) {
      const detail = (e as { data?: { detail?: string } }).data?.detail;
      setErr(detail || t("common.error"));
    }
  };

  if (submitted) {
    return (
      <Box sx={{ maxWidth: 560, mx: "auto", mt: 4 }}>
        <Card>
          <CardContent sx={{ p: 4, textAlign: "center" }}>
            <CheckCircleIcon sx={{ fontSize: 64, color: "#10B981", mb: 2 }} />
            <Typography variant="h5" fontWeight={700} gutterBottom>
              {t("requests.submitted")}
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              {t("requests.submittedHint", { tracking: submitted.tracking })}
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center">
              <Button
                variant="outlined"
                onClick={() => {
                  setSubmitted(null);
                  setCategoryId("");
                  setTitle("");
                  setDescription("");
                }}
              >
                {t("requests.sendAnother")}
              </Button>
              <Button
                variant="contained"
                onClick={() => navigate(`/student/requests/${submitted.id}`)}
              >
                {t("requests.details")}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      <Box mb={3}>
        <Typography variant="h4" fontWeight={700}>
          {t("requests.newTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("requests.newSubtitle")}
        </Typography>
      </Box>

      <Card>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <form onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              {err && <Alert severity="error">{err}</Alert>}

              <TextField
                select
                label={t("requests.category")}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                fullWidth
                disabled={catsLoading}
                helperText={catsLoading ? t("common.loading") : ""}
              >
                {categories.map((c) => (
                  <MenuItem key={c.id} value={String(c.id)}>
                    {"— ".repeat(c.level)}
                    {c.name}
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      · SLA {c.sla_hours}h
                    </Typography>
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label={t("requests.title")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                fullWidth
                placeholder={t("requests.titlePlaceholder")}
                inputProps={{ maxLength: 500 }}
              />

              <TextField
                label={t("requests.description")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                fullWidth
                multiline
                minRows={5}
                placeholder={t("requests.descriptionPlaceholder")}
              />

              <Stack direction="row" justifyContent="flex-end" spacing={2}>
                <Button
                  variant="outlined"
                  onClick={() => navigate("/student/requests")}
                  disabled={createState.isLoading}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  startIcon={
                    createState.isLoading ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <SendIcon />
                    )
                  }
                  disabled={createState.isLoading}
                >
                  {t("requests.submit")}
                </Button>
              </Stack>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
