import { useTranslation } from "react-i18next";
import { Alert, Box, Step, StepLabel, Stepper, Typography } from "@mui/material";

import type { RequestStatus } from "@/features/requests/requestsApi";
import { PROGRESS_STEPS, progressIndex } from "@/features/requests/statusMeta";

const STEP_LABEL_KEYS: Record<string, { label: string; hint: string }> = {
  new: { label: "requests.stepNew", hint: "requests.stepNewHint" },
  accepted: { label: "requests.stepAccepted", hint: "requests.stepAcceptedHint" },
  in_progress: { label: "requests.stepInProgress", hint: "requests.stepInProgressHint" },
  completed: { label: "requests.stepCompleted", hint: "requests.stepCompletedHint" },
};

interface Props {
  status: RequestStatus;
  /** Latest history comment, used to explain a return or a rejection. */
  lastComment?: string | null;
}

/**
 * Shows where a request stands in the pipeline.
 *
 * `returned` and `rejected` are off the happy path, so instead of inventing a
 * step for them the stepper freezes at the step the request left and an alert
 * explains what happened and what the reader should do next.
 */
export default function RequestProgress({ status, lastComment }: Props) {
  const { t } = useTranslation();

  const activeIndex = progressIndex(status);
  const isReturned = status === "returned";
  const isRejected = status === "rejected";
  const isCompleted = status === "completed";
  const offPath = isReturned || isRejected;

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} mb={0.5}>
        {t("requests.progressTitle")}
      </Typography>
      {!offPath && (
        <Typography variant="caption" color="text.secondary">
          {t("requests.progressStep", {
            current: activeIndex + 1,
            total: PROGRESS_STEPS.length,
          })}
        </Typography>
      )}

      <Stepper
        activeStep={offPath ? 0 : activeIndex}
        alternativeLabel
        // A rejected or returned request has stopped moving; greying the line
        // keeps it from reading as "still in flight".
        sx={{ mt: 2, opacity: offPath ? 0.5 : 1 }}
      >
        {PROGRESS_STEPS.map((step, i) => (
          <Step key={step} completed={!offPath && i < activeIndex}>
            <StepLabel
              optional={
                <Typography variant="caption" color="text.secondary">
                  {t(STEP_LABEL_KEYS[step].hint)}
                </Typography>
              }
            >
              {t(STEP_LABEL_KEYS[step].label)}
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      {isReturned && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {t("requests.returnedBanner")}
          {lastComment && (
            <Typography variant="body2" fontWeight={600} mt={0.5}>
              {lastComment}
            </Typography>
          )}
        </Alert>
      )}
      {isRejected && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {t("requests.rejectedBanner")}
          {lastComment && (
            <Typography variant="body2" fontWeight={600} mt={0.5}>
              {lastComment}
            </Typography>
          )}
        </Alert>
      )}
      {isCompleted && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {t("requests.completedBanner")}
        </Alert>
      )}
    </Box>
  );
}
