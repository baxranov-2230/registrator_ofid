import { useTranslation } from "react-i18next";
import { Box, Step, StepLabel, Stepper, Typography } from "@mui/material";
import CancelIcon from "@mui/icons-material/Cancel";
import ReplyIcon from "@mui/icons-material/Reply";

import type { RequestHistoryOut, RequestStatus } from "@/features/requests/requestsApi";
import { formatDateTime } from "@/features/requests/format";
import { PROGRESS_STEPS, progressIndex, STATUS_COLOR } from "@/features/requests/statusMeta";

interface Props {
  status: RequestStatus;
  history: RequestHistoryOut[];
}

/** Latest history entry that moved the request *into* `status`. */
function lastEntryInto(history: RequestHistoryOut[], status: string) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const h = history[i];
    if (h.new_status === status && h.old_status !== h.new_status) return h;
  }
  return null;
}

/**
 * Where the request stands, in two parts: a stepper over the normal pipeline,
 * and a plain-language box saying what the current state means and what is
 * expected next.
 *
 * Step labels are the status names themselves, so the chip at the top of the
 * page ("Yangi") and the highlighted step ("Yangi") always agree. Reached steps
 * show when they were reached; later steps say what will happen there.
 *
 * `returned` and `rejected` are detours rather than stops. The stepper marks
 * the step the request left from, and the box underneath gives the reason.
 */
export default function RequestProgress({ status, history }: Props) {
  const { t } = useTranslation();

  const isReturned = status === "returned";
  const isRejected = status === "rejected";
  const offPath = isReturned || isRejected;
  const entry = lastEntryInto(history, status);

  // For a detour, the step it left from; otherwise the current step.
  const activeIndex = offPath
    ? Math.max(0, progressIndex((entry?.old_status ?? "new") as RequestStatus))
    : progressIndex(status);

  const reason = offPath ? entry?.comment : null;
  const color = STATUS_COLOR[status];

  return (
    <Box>
      <Stepper activeStep={activeIndex} alternativeLabel>
        {PROGRESS_STEPS.map((step, i) => {
          const isDetourStep = offPath && i === activeIndex;
          const reached = i <= activeIndex;
          const done = i < activeIndex || (status === "completed" && i === activeIndex);
          const reachedAt = isDetourStep
            ? entry?.created_at
            : reached
              ? (lastEntryInto(history, step) ??
                  // Legacy rows reached the working step through `accepted`.
                  (step === "in_progress" ? lastEntryInto(history, "accepted") : null))
                  ?.created_at
              : undefined;

          return (
            <Step key={step} completed={done}>
              <StepLabel
                error={isRejected && isDetourStep}
                icon={
                  isDetourStep ? (
                    isRejected ? (
                      <CancelIcon color="error" />
                    ) : (
                      <ReplyIcon sx={{ color: STATUS_COLOR.returned }} />
                    )
                  ) : undefined
                }
                optional={
                  <Typography
                    variant="caption"
                    color={reached ? "text.secondary" : "text.disabled"}
                    display="block"
                  >
                    {/* A rejected request will never reach the later steps,
                        so they get no "what happens here" hint. */}
                    {reachedAt
                      ? formatDateTime(reachedAt)
                      : reached || isRejected
                        ? ""
                        : t(`requests.stepHint.${step}`)}
                  </Typography>
                }
              >
                {t(`requests.status.${isDetourStep ? status : step}`)}
              </StepLabel>
            </Step>
          );
        })}
      </Stepper>

      <Box
        sx={{
          mt: 3,
          p: 2,
          borderRadius: 1,
          borderLeft: "4px solid",
          borderColor: color,
          bgcolor: color + "0F",
        }}
      >
        <Typography variant="subtitle1" fontWeight={700} sx={{ color }}>
          {t(`requests.guide.${status}.title`)}
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          {t(`requests.guide.${status}.body`)}
        </Typography>
        {reason && (
          <Typography variant="body2" mt={1}>
            <strong>{t("requests.reasonLabel")}:</strong> {reason}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
