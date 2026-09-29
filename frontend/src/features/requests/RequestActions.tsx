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
import { TRANSITION_ACTIONS, type TransitionAction } from "@/features/requests/statusMeta";
import AnswerDialog from "@/features/requests/AnswerDialog";
import { formatApiError } from "@/shared/api/errors";

interface Props {
  request: RequestDetail;
}

/**
 * Workflow controls as named buttons.
 *
 * Each allowed step is its own verb ("Javob berish", "Qaytarish") with a line
 * beside it saying what pressing it changes, so the operator does not have to
 * know the state machine. "Javob berish" opens the final-answer form; a return
 * opens a dialog that will not submit without a reason.
 */
export default function RequestActions({ request }: Props) {
  const { t } = useTranslation();
  const [transition, transitionState] = useTransitionRequestMutation();

  const [pending, setPending] = useState<TransitionAction | null>(null);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const actions = TRANSITION_ACTIONS[request.status] ?? [];

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

  // Closed requests have nothing to do; the status box above already says so.
  if (actions.length === 0) return null;

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
        {t("requests.actionsTitle")}
      </Typography>

      <Stack spacing={1.5}>
        {actions.map((a, i) => (
          <Stack
            key={a.to}
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 0.75, sm: 2 }}
            alignItems={{ sm: "center" }}
          >
            <Button
              // The first action is the normal next step; the rest are detours.
              variant={i === 0 ? "contained" : "outlined"}
              color={a.color}
              onClick={() => setPending(a)}
              disabled={transitionState.isLoading}
              sx={{ minWidth: 170, flexShrink: 0 }}
            >
              {t(a.labelKey)}
            </Button>
            <Typography variant="body2" color="text.secondary">
              {t(a.hintKey)}
            </Typography>
          </Stack>
        ))}
      </Stack>

      {pending?.kind === "answer" && <AnswerDialog requestId={request.id} onClose={close} />}

      <Dialog open={pending?.kind === "transition"} onClose={close} fullWidth maxWidth="sm">
        {pending && (
          <>
            <DialogTitle>
              {t("requests.confirmAction", { action: t(pending.labelKey) })}
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" mb={2}>
                {t(pending.hintKey)}
              </Typography>
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
                label={
                  pending.commentRequired
                    ? t("requests.reasonForStudent")
                    : t("requests.transitionComment")
                }
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
