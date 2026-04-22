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
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SubAddIcon from "@mui/icons-material/SubdirectoryArrowRight";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

import {
  CategoryNode,
  useCreateCategoryMutation,
  useListCategoriesQuery,
} from "@/features/admin/adminApi";

const PRIORITY_COLORS: Record<string, string> = {
  low: "#64748B",
  normal: "#3B82F6",
  high: "#F59E0B",
  critical: "#EF4444",
};

export default function CategoriesPage() {
  const { t } = useTranslation();
  const { data: tree = [], isLoading } = useListCategoriesQuery();
  const [dialog, setDialog] = useState<{ parentId: number | null } | null>(null);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            {t("nav.categories")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("categories.subtitle")}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ parentId: null })}>
          {t("categories.newCategory")}
        </Button>
      </Stack>

      {isLoading ? (
        <Typography color="text.secondary">{t("common.loading")}</Typography>
      ) : tree.length === 0 ? (
        <Card>
          <CardContent sx={{ py: 8, textAlign: "center" }}>
            <Typography color="text.secondary">{t("categories.empty")}</Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {tree.map((node) => (
            <CategoryCard
              key={node.id}
              node={node}
              depth={0}
              onAddChild={(parentId) => setDialog({ parentId })}
            />
          ))}
        </Stack>
      )}

      {dialog && <CategoryDialog parentId={dialog.parentId} onClose={() => setDialog(null)} />}
    </Box>
  );
}

function CategoryCard({
  node,
  depth,
  onAddChild,
}: {
  node: CategoryNode;
  depth: number;
  onAddChild: (parentId: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Box>
      <Card sx={{ ml: depth * 3 }}>
        <CardContent sx={{ py: 2 }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            {depth > 0 && <SubAddIcon color="action" />}
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {node.name}
              </Typography>
              <Stack direction="row" spacing={1} mt={0.5} alignItems="center">
                <Chip
                  size="small"
                  icon={<AccessTimeIcon sx={{ fontSize: 14 }} />}
                  label={`SLA: ${node.sla_hours}h`}
                  variant="outlined"
                />
                <Chip
                  size="small"
                  label={t(`requests.priority.${node.priority}`)}
                  sx={{
                    bgcolor: PRIORITY_COLORS[node.priority] + "15",
                    color: PRIORITY_COLORS[node.priority],
                    fontWeight: 600,
                  }}
                />
                {!node.is_active && (
                  <Chip size="small" label={t("common.no")} color="default" variant="outlined" />
                )}
              </Stack>
            </Box>
            <IconButton onClick={() => onAddChild(node.id)} title={t("categories.addChild")}>
              <AddIcon />
            </IconButton>
          </Stack>
        </CardContent>
      </Card>
      {node.children.length > 0 && (
        <Stack spacing={1} mt={1}>
          {node.children.map((child) => (
            <CategoryCard key={child.id} node={child} depth={depth + 1} onAddChild={onAddChild} />
          ))}
        </Stack>
      )}
    </Box>
  );
}

function CategoryDialog({
  parentId,
  onClose,
}: {
  parentId: number | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [create, state] = useCreateCategoryMutation();
  const [form, setForm] = useState({
    name: "",
    sla_hours: "24",
    priority: "normal" as const,
  });
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await create({
        parent_id: parentId,
        name: form.name,
        sla_hours: Number(form.sla_hours),
        priority: form.priority,
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
        <DialogTitle>
          {parentId ? t("categories.newSubcategory") : t("categories.newCategory")}
        </DialogTitle>
        <DialogContent>
          {err && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {err}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("categories.form.name")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              fullWidth
            />
            <TextField
              type="number"
              label={t("categories.form.slaHours")}
              value={form.sla_hours}
              onChange={(e) => setForm((f) => ({ ...f, sla_hours: e.target.value }))}
              required
              fullWidth
              inputProps={{ min: 1, max: 720 }}
            />
            <TextField
              select
              label={t("categories.form.priority")}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as "low" | "normal" | "high" | "critical" }))}
              fullWidth
            >
              <MenuItem value="low">{t("requests.priority.low")}</MenuItem>
              <MenuItem value="normal">{t("requests.priority.normal")}</MenuItem>
              <MenuItem value="high">{t("requests.priority.high")}</MenuItem>
              <MenuItem value="critical">{t("requests.priority.critical")}</MenuItem>
            </TextField>
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
