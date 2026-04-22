import { useMemo, useState } from "react";
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
  TextField,
} from "@mui/material";

import { useListUsersQuery } from "@/features/admin/adminApi";
import { useAssignRequestMutation } from "@/features/requests/requestsApi";

interface Props {
  requestId: number;
  facultyId: number | null;
  departmentId: number | null;
  onClose: () => void;
}

export default function AssignDialog({
  requestId,
  facultyId,
  departmentId,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { data: staff = [], isLoading } = useListUsersQuery({ role: "staff" });
  const { data: registrators = [] } = useListUsersQuery({ role: "registrator" });
  const [assign, state] = useAssignRequestMutation();

  const [assigneeId, setAssigneeId] = useState("");
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const candidates = useMemo(
    () => [...staff, ...registrators].filter((u) => u.is_active),
    [staff, registrators],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!assigneeId) return setErr(t("requests.selectAssignee"));
    try {
      await assign({
        id: requestId,
        data: {
          assignee_id: Number(assigneeId),
          faculty_id: facultyId,
          department_id: departmentId,
          comment: comment.trim() || null,
        },
      }).unwrap();
      onClose();
    } catch (e: unknown) {
      const detail = (e as { data?: { detail?: string } }).data?.detail;
      setErr(detail || t("common.error"));
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{t("requests.assignTitle")}</DialogTitle>
        <DialogContent>
          {err && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {err}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label={t("requests.assignee")}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              required
              fullWidth
              disabled={isLoading}
            >
              {candidates.map((u) => (
                <MenuItem key={u.id} value={String(u.id)}>
                  {u.full_name} — {t(`role.${u.role.name}`)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label={t("requests.assignComment")}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="contained" disabled={state.isLoading}>
            {t("requests.assign")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
