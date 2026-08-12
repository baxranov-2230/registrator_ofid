import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  useTransitionRequestMutation,
  type RequestDetail,
} from "@/features/requests/requestsApi";
import {
  canRunAction,
  TRANSITION_ACTIONS,
  type TransitionAction,
} from "@/features/requests/statusMeta";
import { formatApiError } from "@/shared/api/errors";

interface Props {
  request: RequestDetail;
  role: string | undefined;
}

/**
 * Workflow controls as named buttons.
 *
 * Previously this was a bare status dropdown plus a generic confirm button, so
 * the operator had to know the state machine to use it. Each allowed transition
 * is now its own verb ("Qabul qilish", "Rad etish"), and the destructive ones
 * open a dialog that requires a reason before they will submit.
 */
export default function RequestActions({ request, role }: Props) {
  const { t } = useTranslation();
  const [transition, transitionState] = useTransitionRequestMutation();

  const [pending, setPending] = useState<TransitionAction | null>(null);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const actions = (TRANSITION_ACTIONS[request.status] ?? []).filter((a) =>
    canRunAction(a, role),
  );

  const close = () => {
    setPending(null);
    setComment("");
    setErr(null);
  };

  const run = async () => {
    if (!pending) return;
    if (pending.commentRequired && !comment.trim()) {
      setErr(t("requests.commentRequired"));
      return;
    }
    setErr(null);
    try {
      await transition({
        id: request.id,
        data: { status: pending.to, comment: comment.trim() || null },
      }).unwrap();
      close();
    } catch (e: unknown) {
      setErr(formatApiError(e, t("common.error")));
    }
  };

  if (actions.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t("requests.noActions")}
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>
        {t("requests.actionsTitle")}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {t("requests.actionsHint")}
      </Typography>

      <Stack direction="row" spacing={1.5} mt={1.5} flexWrap="wrap" useFlexGap>
        {actions.map((a) => (
          <Button
            key={a.to}
            variant={a.color === "primary" || a.color === "success" ? "contained" : "outlined"}
            color={a.color}
            onClick={() => setPending(a)}
            disabled={transitionState.isLoading}
          >
            {t(a.labelKey)}
          </Button>
        ))}
      </Stack>

      <Dialog open={pending !== null} onClose={close} fullWidth maxWidth="sm">
        {pending && (
          <>
            <DialogTitle>
              {t("requests.confirmAction", { action: t(pending.labelKey) })}
            </DialogTitle>
            <DialogContent>
              {err && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {err}
                </Alert>
              )}
              <TextField
                autoFocus
                fullWidth
                multiline
                minRows={3}
                label={t("requests.commentFor", { action: t(pending.labelKey) })}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                required={pending.commentRequired}
                helperText={
                  pending.commentRequired ? t("requests.commentRequired") : undefined
                }
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={close} disabled={transitionState.isLoading}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="contained"
                color={pending.color}
                onClick={run}
                disabled={transitionState.isLoading}
              >
                {t(pending.labelKey)}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
