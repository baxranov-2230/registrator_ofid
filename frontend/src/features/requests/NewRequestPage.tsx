import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormHelperText,
  IconButton,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CheckIcon from "@mui/icons-material/Check";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import BoltIcon from "@mui/icons-material/Bolt";

import { useListCategoriesQuery } from "@/features/admin/adminApi";
import { useCreateRequestMutation } from "@/features/requests/requestsApi";
import ServicePicker from "@/features/requests/ServicePicker";
import ServiceTypeCards from "@/features/requests/ServiceTypeCards";
import { formatApiError } from "@/shared/api/errors";

const DESCRIPTION_MAX = 4000;
const TITLE_MAX = 500;

type FieldErrors = Partial<
  Record<"serviceType" | "service" | "title" | "description", string>
>;

/** Numbered section heading, so the flow reads as three explicit steps. */
function Step({
  index,
  title,
  hint,
  done,
  children,
}: {
  index: number;
  title: string;
  hint?: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box component="section">
      <Stack direction="row" spacing={1.5} alignItems="flex-start" mb={1.5}>
        <Box
          aria-hidden
          sx={{
            flexShrink: 0,
            width: 26,
            height: 26,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            fontSize: 13,
            fontWeight: 700,
            bgcolor: done ? "primary.main" : "rgba(79, 70, 229, 0.1)",
            color: done ? "primary.contrastText" : "primary.main",
            transition: "background-color .2s",
          }}
        >
          {index}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            {title}
          </Typography>
          {hint && (
            <Typography variant="caption" color="text.secondary">
              {hint}
            </Typography>
          )}
        </Box>
      </Stack>
      {children}
    </Box>
  );
}

export default function NewRequestPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: catTree = [], isLoading: catsLoading } = useListCategoriesQuery();
  const [createRequest, createState] = useCreateRequestMutation();

  // The dashboard's service-type cards deep-link here with `?type=`, so the
  // student arrives with step 1 already answered.
  const [searchParams] = useSearchParams();
  const [serviceTypeId, setServiceTypeId] = useState<string>(
    () => searchParams.get("type") ?? "",
  );
  const [categoryId, setCategoryId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState<{
    id: number;
    tracking: string;
    /** Who the server routed it to, so the student knows it reached someone. */
    assignee: string | null;
  } | null>(null);

  /** Roots of the catalogue tree are the six service types. */
  const serviceTypes = useMemo(() => catTree.filter((n) => n.is_active), [catTree]);

  /**
   * Only the chosen type's services. The student never sees all 59 at once,
   * and the list is empty until a type is picked.
   */
  const services = useMemo(() => {
    if (!serviceTypeId) return [];
    const type = serviceTypes.find((n) => String(n.id) === serviceTypeId);
    return (type?.children ?? []).filter((c) => c.is_active);
  }, [serviceTypeId, serviceTypes]);

  const selectedType = serviceTypes.find((s) => String(s.id) === serviceTypeId);
  const selectedService = services.find((s) => String(s.id) === categoryId);

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!serviceTypeId) errs.serviceType = t("requests.serviceTypeRequired");
    if (!categoryId) errs.service = t("requests.serviceRequired");
    if (title.trim().length < 3) errs.title = t("requests.titleRequired");
    if (description.trim().length < 3) errs.description = t("requests.descriptionRequired");
    return errs;
  };

  const clearField = (key: keyof FieldErrors) =>
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      // Send focus to the first problem rather than leaving the student to
      // hunt for it — the form is taller than a phone screen.
      document
        .querySelector<HTMLElement>("[data-invalid='true']")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    try {
      const res = await createRequest({
        category_id: Number(categoryId),
        service_type_id: Number(serviceTypeId),
        title: title.trim(),
        description: description.trim(),
      }).unwrap();
      setSubmitted({
        id: res.id,
        tracking: res.tracking_no,
        assignee: res.assignee?.full_name ?? null,
      });
    } catch (e: unknown) {
      setFormError(formatApiError(e, t("common.error")));
    }
  };

  const resetForm = () => {
    setSubmitted(null);
    setServiceTypeId("");
    setCategoryId("");
    setTitle("");
    setDescription("");
    setFieldErrors({});
    setFormError(null);
  };

  // ── Success ───────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <Box sx={{ maxWidth: 520, mx: "auto", width: "100%" }}>
        <Card sx={{ overflow: "hidden" }}>
          <Box
            sx={{
              px: { xs: 2.5, sm: 4 },
              pt: { xs: 4, sm: 5 },
              pb: 3,
              textAlign: "center",
              background:
                "linear-gradient(180deg, rgba(16,185,129,0.10) 0%, rgba(16,185,129,0) 100%)",
            }}
          >
            <Box
              sx={{
                width: 68,
                height: 68,
                mx: "auto",
                mb: 2,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                bgcolor: "success.main",
                color: "#fff",
              }}
            >
              <CheckCircleOutlineIcon sx={{ fontSize: 38 }} />
            </Box>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              {t("requests.submitted")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("requests.submittedShort")}
            </Typography>
          </Box>

          <CardContent sx={{ px: { xs: 2.5, sm: 4 }, pb: 3 }}>
            {/* The tracking number is the one thing worth keeping, so it is
                given its own row and a copy button. */}
            <Box
              sx={{
                p: 2,
                borderRadius: 3,
                border: "1px dashed",
                borderColor: "divider",
                bgcolor: "background.default",
              }}
            >
              <Typography variant="caption" color="text.secondary" display="block">
                {t("requests.trackingNo")}
              </Typography>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Typography
                  variant="h6"
                  fontWeight={700}
                  sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {submitted.tracking}
                </Typography>
                <Tooltip title={t("common.copy")}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      navigator.clipboard?.writeText(submitted.tracking);
                      setCopied(true);
                    }}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>

            {submitted.assignee && (
              <Alert severity="info" icon={false} sx={{ mt: 2, borderRadius: 3 }}>
                {t("requests.submittedRouted", { name: submitted.assignee })}
              </Alert>
            )}

            <Stack spacing={1.25} mt={3}>
              <Button
                fullWidth
                size="large"
                variant="contained"
                onClick={() => navigate(`/student/requests/${submitted.id}`)}
              >
                {t("requests.details")}
              </Button>
              <Button fullWidth size="large" variant="text" onClick={resetForm}>
                {t("requests.sendAnother")}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Snackbar
          open={copied}
          autoHideDuration={2000}
          onClose={() => setCopied(false)}
          message={t("common.copied")}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        />
      </Box>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  const steps = [
    { n: 1, label: t("requests.serviceType"), done: Boolean(serviceTypeId) },
    { n: 2, label: t("requests.service"), done: Boolean(categoryId) },
    { n: 3, label: t("requests.detailsStep"), done: title.trim().length >= 3 && description.trim().length >= 3 },
  ];

  return (
    <Box sx={{ width: "100%" }}>
      <Stack direction="row" alignItems="center" spacing={0.5} mb={2}>
        <IconButton
          onClick={() => navigate("/student/requests")}
          aria-label={t("common.back")}
          // Kept at a comfortable tap size rather than `size="small"`.
          sx={{ ml: -1, width: 40, height: 40 }}
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" color="text.secondary">
          {t("requests.myTitle")}
        </Typography>
      </Stack>

      {/* Matches the dashboard hero, so the two pages read as one product. */}
      <Card
        sx={{
          mb: { xs: 2, sm: 3 },
          background: "linear-gradient(120deg, #F5F8FF 0%, #FFFFFF 60%)",
        }}
      >
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          sx={{ p: { xs: 2.5, sm: 3 } }}
        >
          <Box
            sx={{
              width: 52,
              height: 52,
              flexShrink: 0,
              borderRadius: 2.5,
              display: { xs: "none", sm: "grid" },
              placeItems: "center",
              color: "#fff",
              background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
            }}
          >
            <SendIcon />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h5"
              fontWeight={800}
              sx={{ fontSize: { xs: "1.375rem", sm: "1.75rem" }, letterSpacing: "-0.02em" }}
            >
              {t("requests.newTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {t("requests.newSubtitle")}
            </Typography>
          </Box>
        </Stack>
      </Card>

      <Box
        sx={{
          display: "grid",
          gap: { xs: 2, lg: 3 },
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 320px" },
          alignItems: "start",
        }}
      >
      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={{ xs: 2, sm: 2.5 }}>
          <Collapse in={Boolean(formError)} unmountOnExit>
            <Alert severity="error" onClose={() => setFormError(null)} sx={{ borderRadius: 3 }}>
              {formError}
            </Alert>
          </Collapse>

          <Card>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Step
                index={1}
                title={t("requests.serviceType")}
                hint={t("requests.serviceTypeHint")}
                done={Boolean(serviceTypeId)}
              >
                <Box
                  data-invalid={fieldErrors.serviceType ? "true" : undefined}
                  // The group is outlined on error, rather than reddening all
                  // six cards — the choice is missing, not each option invalid.
                  sx={
                    fieldErrors.serviceType
                      ? {
                          p: 1,
                          m: -1,
                          borderRadius: 3,
                          border: "1.5px solid",
                          borderColor: "error.main",
                        }
                      : undefined
                  }
                >
                  <ServiceTypeCards
                    types={serviceTypes}
                    selectedId={serviceTypeId}
                    loading={catsLoading}
                    onSelect={(id) => {
                      // Switching type invalidates the service chosen under the
                      // previous one, so clear it rather than submit a mismatch.
                      setServiceTypeId(id);
                      setCategoryId("");
                      clearField("serviceType");
                    }}
                  />
                  {fieldErrors.serviceType && (
                    <FormHelperText error sx={{ mt: 1 }}>
                      {fieldErrors.serviceType}
                    </FormHelperText>
                  )}
                </Box>
              </Step>

              {/* Step 2 only exists once a type is chosen, so the student is
                  never shown an empty or disabled list to puzzle over. */}
              <Collapse in={Boolean(serviceTypeId)} unmountOnExit>
                <Divider sx={{ my: 3 }} />
                <Step
                  index={2}
                  title={t("requests.service")}
                  hint={selectedType?.name}
                  done={Boolean(categoryId)}
                >
                  <Box data-invalid={fieldErrors.service ? "true" : undefined}>
                    <ServicePicker
                      services={services}
                      selectedId={categoryId}
                      error={Boolean(fieldErrors.service)}
                      onSelect={(id) => {
                        setCategoryId(id);
                        clearField("service");
                      }}
                    />
                    {fieldErrors.service && (
                      <FormHelperText error sx={{ mt: 1 }}>
                        {fieldErrors.service}
                      </FormHelperText>
                    )}
                  </Box>
                </Step>
              </Collapse>
            </CardContent>
          </Card>

          <Collapse in={Boolean(categoryId)} unmountOnExit>
            <Card>
              <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                <Step index={3} title={t("requests.detailsStep")} hint={t("requests.detailsStepHint")}>
                  {selectedService && (
                    <Chip
                      size="small"
                      label={selectedService.name}
                      onDelete={() => setCategoryId("")}
                      sx={{
                        mb: 2,
                        maxWidth: "100%",
                        height: "auto",
                        py: 0.5,
                        bgcolor: "rgba(79, 70, 229, 0.08)",
                        color: "primary.main",
                        "& .MuiChip-label": {
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          lineHeight: 1.4,
                        },
                      }}
                    />
                  )}

                  <Stack spacing={2.5}>
                    <TextField
                      label={t("requests.title")}
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        clearField("title");
                      }}
                      fullWidth
                      required
                      error={Boolean(fieldErrors.title)}
                      helperText={fieldErrors.title || t("requests.titleHint")}
                      placeholder={t("requests.titlePlaceholder")}
                      inputProps={{ maxLength: TITLE_MAX }}
                      data-invalid={fieldErrors.title ? "true" : undefined}
                    />

                    <Box data-invalid={fieldErrors.description ? "true" : undefined}>
                      <TextField
                        label={t("requests.description")}
                        value={description}
                        onChange={(e) => {
                          setDescription(e.target.value);
                          clearField("description");
                        }}
                        fullWidth
                        required
                        multiline
                        minRows={4}
                        maxRows={12}
                        error={Boolean(fieldErrors.description)}
                        placeholder={t("requests.descriptionPlaceholder")}
                        inputProps={{ maxLength: DESCRIPTION_MAX }}
                      />
                      <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mt: 0.5 }}>
                        <FormHelperText error={Boolean(fieldErrors.description)} sx={{ m: 0 }}>
                          {fieldErrors.description || t("requests.descriptionHint")}
                        </FormHelperText>
                        <FormHelperText sx={{ m: 0, flexShrink: 0 }}>
                          {description.length}/{DESCRIPTION_MAX}
                        </FormHelperText>
                      </Stack>
                    </Box>
                  </Stack>
                </Step>
              </CardContent>
            </Card>
          </Collapse>

          {/* The student picks no handler, so say who will receive this.
              Hidden on large screens, where the rail already says it. */}
          <Stack
            direction="row"
            spacing={1.25}
            sx={{
              display: { xs: "flex", lg: "none" },
              p: 1.75,
              borderRadius: 3,
              bgcolor: "rgba(59, 130, 246, 0.06)",
              border: "1px solid",
              borderColor: "rgba(59, 130, 246, 0.18)",
            }}
          >
            <BoltIcon fontSize="small" sx={{ color: "info.main", flexShrink: 0, mt: 0.15 }} />
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              {t("requests.autoRouteNotice")}
            </Typography>
          </Stack>

          <Stack
            direction={{ xs: "column-reverse", sm: "row" }}
            spacing={1.25}
            justifyContent="flex-end"
            sx={{ pb: { xs: 1, sm: 0 } }}
          >
            <Button
              variant="text"
              size="large"
              onClick={() => navigate("/student/requests")}
              disabled={createState.isLoading}
              fullWidth={false}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={createState.isLoading}
              startIcon={
                createState.isLoading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <SendIcon />
                )
              }
              sx={{ width: { xs: "100%", sm: "auto" }, minWidth: { sm: 200 } }}
            >
              {createState.isLoading ? t("requests.submitting") : t("requests.submit")}
            </Button>
          </Stack>
        </Stack>
      </form>

      {/* Guidance rail: progress plus what happens after sending. Desktop
          only — on a phone it would sit far below the submit button and be
          read after the decision it is meant to inform. */}
      <Stack spacing={2} sx={{ display: { xs: "none", lg: "flex" }, position: "sticky", top: 88 }}>
        <Card>
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>
              {t("requests.progressTitle")}
            </Typography>
            <Stack spacing={2}>
              {steps.map((s) => (
                <Stack key={s.n} direction="row" spacing={1.5} alignItems="center">
                  <Box
                    sx={{
                      width: 26,
                      height: 26,
                      flexShrink: 0,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      bgcolor: s.done ? "primary.main" : "rgba(79,70,229,.1)",
                      color: s.done ? "primary.contrastText" : "primary.main",
                      transition: "background-color .2s",
                    }}
                  >
                    {s.done ? <CheckIcon sx={{ fontSize: 16 }} /> : s.n}
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: s.done ? 600 : 400, color: s.done ? "text.primary" : "text.secondary" }}
                  >
                    {s.label}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ bgcolor: "rgba(59,130,246,0.04)" }}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <BoltIcon fontSize="small" sx={{ color: "info.main" }} />
              <Typography variant="subtitle2" fontWeight={700}>
                {t("requests.whatNext")}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              {t("requests.autoRouteNotice")}
            </Typography>
          </CardContent>
        </Card>
      </Stack>
      </Box>
    </Box>
  );
}
