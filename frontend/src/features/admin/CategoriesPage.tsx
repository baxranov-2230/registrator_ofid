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
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import EditIcon from "@mui/icons-material/EditOutlined";
import BlockIcon from "@mui/icons-material/BlockOutlined";
import AutoReplyIcon from "@mui/icons-material/SmartToyOutlined";
import FacultyIcon from "@mui/icons-material/SchoolOutlined";
import GeneralIcon from "@mui/icons-material/SupportAgentOutlined";

import PageHeader from "@/shared/components/PageHeader";
import {
  CategoryNode,
  Priority,
  SERVICE_ROUTINGS,
  ServiceRouting,
  useCreateCategoryMutation,
  useDeactivateCategoryMutation,
  useListCategoriesQuery,
  useUpdateCategoryMutation,
} from "@/features/admin/adminApi";
import { formatApiError } from "@/shared/api/errors";

const PRIORITY_COLORS: Record<string, string> = {
  low: "#64748B",
  normal: "#3B82F6",
  high: "#F59E0B",
  critical: "#EF4444",
};

const ROUTING_META: Record<ServiceRouting, { color: string; Icon: typeof AutoReplyIcon }> = {
  auto_reply: { color: "#8B5CF6", Icon: AutoReplyIcon },
  faculty_manager: { color: "#0D9488", Icon: FacultyIcon },
  general_manager: { color: "#EA580C", Icon: GeneralIcon },
};

/**
 * Two levels: a request type ("Murojaat turi") is a name and a description;
 * the service types inside it ("Xizmat turi") carry the priority, SLA and the
 * routing the backend applies when a request is filed under one.
 */
type DialogState =
  | { kind: "type"; edit?: CategoryNode }
  | { kind: "service"; parent: CategoryNode; edit?: CategoryNode };

export default function CategoriesPage() {
  const { t } = useTranslation();
  const { data: tree = [], isLoading, error } = useListCategoriesQuery();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [deactivate] = useDeactivateCategoryMutation();

  const handleDeactivate = async (node: CategoryNode) => {
    const key = node.parent_id === null ? "categories.deactivateTypeConfirm" : "categories.deactivateConfirm";
    if (!window.confirm(t(key, { name: node.name }))) return;
    await deactivate(node.id);
  };

  return (
    <Box>
      <PageHeader
        title={t("nav.categories")}
        subtitle={t("categories.subtitle")}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ kind: "type" })}>
            {t("categories.newCategory")}
          </Button>
        }
      />

      {error ? (
        <Alert severity="error">{formatApiError(error, t("common.error"))}</Alert>
      ) : isLoading ? (
        <Typography color="text.secondary">{t("common.loading")}</Typography>
      ) : tree.length === 0 ? (
        <Card>
          <CardContent sx={{ py: 8, textAlign: "center" }}>
            <Typography color="text.secondary">{t("categories.empty")}</Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {tree.map((type) => (
            <RequestTypeCard
              key={type.id}
              type={type}
              onEdit={() => setDialog({ kind: "type", edit: type })}
              onAddService={() => setDialog({ kind: "service", parent: type })}
              onEditService={(edit) => setDialog({ kind: "service", parent: type, edit })}
              onDeactivate={handleDeactivate}
            />
          ))}
        </Stack>
      )}

      {dialog?.kind === "type" && <RequestTypeDialog edit={dialog.edit} onClose={() => setDialog(null)} />}
      {dialog?.kind === "service" && (
        <ServiceTypeDialog parent={dialog.parent} edit={dialog.edit} onClose={() => setDialog(null)} />
      )}
    </Box>
  );
}

function RequestTypeCard({
  type,
  onEdit,
  onAddService,
  onEditService,
  onDeactivate,
}: {
  type: CategoryNode;
  onEdit: () => void;
  onAddService: () => void;
  onEditService: (service: CategoryNode) => void;
  onDeactivate: (node: CategoryNode) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
        <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ px: 2.5, py: 2 }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              {type.name}
            </Typography>
            {type.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, whiteSpace: "pre-wrap" }}>
                {type.description}
              </Typography>
            )}
            <Stack direction="row" spacing={1} mt={1} alignItems="center">
              <Chip
                size="small"
                variant="outlined"
                label={t("categories.serviceCount", { count: type.children.length })}
              />
              {!type.is_active && <Chip size="small" label={t("categories.inactive")} variant="outlined" />}
            </Stack>
          </Box>
          <Tooltip title={t("common.edit")}>
            <IconButton onClick={onEdit}>
              <EditIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("categories.addService")}>
            <IconButton onClick={onAddService} color="primary">
              <AddIcon />
            </IconButton>
          </Tooltip>
          {type.is_active && (
            <Tooltip title={t("common.deactivate")}>
              <IconButton onClick={() => onDeactivate(type)} color="error">
                <BlockIcon />
              </IconButton>
            </Tooltip>
          )}
        </Stack>

        <Divider />
        {type.children.length === 0 ? (
          <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 2.5, py: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
              {t("categories.noServices")}
            </Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={onAddService}>
              {t("categories.addService")}
            </Button>
          </Stack>
        ) : (
          <Stack divider={<Divider />} sx={{ bgcolor: "action.hover" }}>
            {type.children.map((service) => (
              <ServiceTypeRow
                key={service.id}
                service={service}
                onEdit={() => onEditService(service)}
                onDeactivate={() => onDeactivate(service)}
              />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function ServiceTypeRow({
  service,
  onEdit,
  onDeactivate,
}: {
  service: CategoryNode;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const { t } = useTranslation();
  const routing = ROUTING_META[service.routing] ?? ROUTING_META.faculty_manager;
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: { xs: 2.5, sm: 4 }, pr: 2.5, py: 1.5 }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600}>
          {service.name}
        </Typography>
        <Stack direction="row" spacing={1} mt={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            icon={<routing.Icon sx={{ fontSize: 16, color: `${routing.color} !important` }} />}
            label={t(`categories.routing.${service.routing}`)}
            sx={{ bgcolor: routing.color + "15", color: routing.color, fontWeight: 600 }}
          />
          <Chip
            size="small"
            icon={<AccessTimeIcon sx={{ fontSize: 14 }} />}
            label={`SLA: ${service.sla_hours}h`}
            variant="outlined"
          />
          <Chip
            size="small"
            label={t(`requests.priority.${service.priority}`)}
            sx={{
              bgcolor: PRIORITY_COLORS[service.priority] + "15",
              color: PRIORITY_COLORS[service.priority],
              fontWeight: 600,
            }}
          />
          {!service.is_active && <Chip size="small" label={t("categories.inactive")} variant="outlined" />}
        </Stack>
      </Box>
      <Tooltip title={t("common.edit")}>
        <IconButton size="small" onClick={onEdit}>
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {service.is_active && (
        <Tooltip title={t("common.deactivate")}>
          <IconButton size="small" onClick={onDeactivate} color="error">
            <BlockIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

function RequestTypeDialog({ edit, onClose }: { edit?: CategoryNode; onClose: () => void }) {
  const { t } = useTranslation();
  const [create, createState] = useCreateCategoryMutation();
  const [update, updateState] = useUpdateCategoryMutation();
  const [name, setName] = useState(edit?.name ?? "");
  const [description, setDescription] = useState(edit?.description ?? "");
  const [err, setErr] = useState<string | null>(null);
  const saving = createState.isLoading || updateState.isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const payload = { name, description: description.trim() || null };
    try {
      if (edit) {
        await update({ id: edit.id, data: payload }).unwrap();
      } else {
        await create({ parent_id: null, ...payload }).unwrap();
      }
      onClose();
    } catch (e: unknown) {
      setErr(formatApiError(e, t("common.error")));
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{edit ? t("categories.editCategory") : t("categories.newCategory")}</DialogTitle>
        <DialogContent>
          {err && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {err}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("categories.form.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
              autoFocus
              inputProps={{ minLength: 2, maxLength: 255 }}
            />
            <TextField
              label={t("categories.form.description")}
              helperText={t("categories.form.descriptionHint")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              minRows={3}
              inputProps={{ maxLength: 2000 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {t("common.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function ServiceTypeDialog({
  parent,
  edit,
  onClose,
}: {
  parent: CategoryNode;
  edit?: CategoryNode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [create, createState] = useCreateCategoryMutation();
  const [update, updateState] = useUpdateCategoryMutation();
  const [form, setForm] = useState<{
    name: string;
    priority: Priority;
    sla_hours: string;
    routing: ServiceRouting;
    auto_reply_text: string;
  }>({
    name: edit?.name ?? "",
    priority: edit?.priority ?? "normal",
    sla_hours: String(edit?.sla_hours ?? 24),
    routing: edit?.routing ?? "faculty_manager",
    auto_reply_text: edit?.auto_reply_text ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const saving = createState.isLoading || updateState.isLoading;
  const autoReply = form.routing === "auto_reply";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const payload = {
      name: form.name,
      priority: form.priority,
      sla_hours: Number(form.sla_hours),
      routing: form.routing,
      auto_reply_text: form.auto_reply_text.trim() || null,
    };
    try {
      if (edit) {
        await update({ id: edit.id, data: payload }).unwrap();
      } else {
        await create({ parent_id: parent.id, ...payload }).unwrap();
      }
      onClose();
    } catch (e: unknown) {
      setErr(formatApiError(e, t("common.error")));
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {edit ? t("categories.editService") : t("categories.newService")}
          <Typography variant="body2" color="text.secondary">
            {t("categories.parentLabel", { name: parent.name })}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {err && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {err}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("categories.form.serviceName")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              fullWidth
              autoFocus
              inputProps={{ minLength: 2, maxLength: 255 }}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                label={t("categories.form.priority")}
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                fullWidth
              >
                <MenuItem value="low">{t("requests.priority.low")}</MenuItem>
                <MenuItem value="normal">{t("requests.priority.normal")}</MenuItem>
                <MenuItem value="high">{t("requests.priority.high")}</MenuItem>
                <MenuItem value="critical">{t("requests.priority.critical")}</MenuItem>
              </TextField>
              <TextField
                type="number"
                label={t("categories.form.slaHours")}
                value={form.sla_hours}
                onChange={(e) => setForm((f) => ({ ...f, sla_hours: e.target.value }))}
                required
                fullWidth
                inputProps={{ min: 1, max: 720 }}
              />
            </Stack>

            <FormControl>
              <FormLabel sx={{ mb: 1 }}>{t("categories.form.routing")}</FormLabel>
              <RadioGroup
                value={form.routing}
                onChange={(e) => setForm((f) => ({ ...f, routing: e.target.value as ServiceRouting }))}
              >
                <Stack spacing={1}>
                  {SERVICE_ROUTINGS.map((r) => {
                    const meta = ROUTING_META[r];
                    const selected = form.routing === r;
                    return (
                      <FormControlLabel
                        key={r}
                        value={r}
                        control={<Radio size="small" />}
                        sx={{
                          m: 0,
                          px: 1.5,
                          py: 1,
                          alignItems: "flex-start",
                          border: "1px solid",
                          borderColor: selected ? meta.color : "divider",
                          borderRadius: 1,
                          bgcolor: selected ? meta.color + "0D" : "transparent",
                          "& .MuiRadio-root": { mt: -0.5 },
                        }}
                        label={
                          <Box>
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <meta.Icon sx={{ fontSize: 18, color: meta.color }} />
                              <Typography variant="body2" fontWeight={600}>
                                {t(`categories.routing.${r}`)}
                              </Typography>
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                              {t(`categories.routingHint.${r}`)}
                            </Typography>
                          </Box>
                        }
                      />
                    );
                  })}
                </Stack>
              </RadioGroup>
            </FormControl>

            {autoReply && (
              <TextField
                label={t("categories.form.autoReplyText")}
                helperText={t("categories.form.autoReplyHint")}
                value={form.auto_reply_text}
                onChange={(e) => setForm((f) => ({ ...f, auto_reply_text: e.target.value }))}
                required
                fullWidth
                multiline
                minRows={4}
                inputProps={{ maxLength: 10000 }}
              />
            )}
            {form.routing === "general_manager" && (
              <Alert severity="info">{t("categories.form.generalHint")}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {t("common.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
