import type { RequestStatus } from "@/features/requests/requestsApi";

export const STATUS_COLOR: Record<RequestStatus, string> = {
  new: "#2D57FE",
  accepted: "#A80BE4",
  in_progress: "#C75B12",
  completed: "#15803D",
  rejected: "#DC2626",
  returned: "#6C757D",
};

export const PRIORITY_COLOR: Record<string, string> = {
  low: "#6C757D",
  normal: "#2D57FE",
  high: "#C75B12",
  critical: "#DC2626",
};

/** Filter order: the live flow first, then the legacy triage states. */
export const STATUS_ORDER: RequestStatus[] = [
  "new",
  "in_progress",
  "returned",
  "completed",
  "accepted",
  "rejected",
];

/**
 * The pipeline a request walks: filed, worked, answered. `returned` is a
 * detour off this line, not a stop on it, so the stepper shows it as a
 * separate state instead of a numbered step.
 */
export const PROGRESS_STEPS: RequestStatus[] = ["new", "in_progress", "completed"];

/** Index of a status on the pipeline, or -1 for the off-path states. */
export function progressIndex(status: RequestStatus): number {
  // A legacy `accepted` request is with its handler, i.e. being worked.
  return PROGRESS_STEPS.indexOf(status === "accepted" ? "in_progress" : status);
}

type ButtonColor = "primary" | "success" | "warning" | "error" | "inherit";

/**
 * A workflow step presented as an action the user takes, rather than a target
 * state they must pick out of a dropdown. `labelKey` uses the verb form
 * ("Javob berish"), so the button says what pressing it does.
 */
export interface TransitionAction {
  to: RequestStatus;
  /**
   * `answer` opens the final-answer form (text and files) — the only way a
   * request is closed. `transition` is a plain status move.
   */
  kind: "transition" | "answer";
  labelKey: string;
  /** One line saying what pressing the button changes, shown beside it. */
  hintKey: string;
  color: ButtonColor;
  /** Require a reason before allowing the action — a return must be explained. */
  commentRequired?: boolean;
}

const START: TransitionAction = {
  to: "in_progress",
  kind: "transition",
  labelKey: "requests.startWork",
  hintKey: "requests.startWorkHint",
  color: "primary",
};
const RESUME: TransitionAction = {
  to: "in_progress",
  kind: "transition",
  labelKey: "requests.resume",
  hintKey: "requests.resumeHint",
  color: "primary",
};
const ANSWER: TransitionAction = {
  to: "completed",
  kind: "answer",
  labelKey: "requests.answerAction",
  hintKey: "requests.answerHint",
  color: "success",
};
const RETURN: TransitionAction = {
  to: "returned",
  kind: "transition",
  labelKey: "requests.return",
  hintKey: "requests.returnHint",
  color: "warning",
  commentRequired: true,
};

/**
 * Mirrors `_ALLOWED_TRANSITIONS` plus the answer endpoint in the backend. The
 * server remains the authority — this only decides which buttons to render.
 * There is no accept or reject: neither is an outcome, the answer is.
 */
export const TRANSITION_ACTIONS: Record<RequestStatus, TransitionAction[]> = {
  new: [START, ANSWER, RETURN],
  accepted: [START, ANSWER, RETURN],
  in_progress: [ANSWER, RETURN],
  returned: [RESUME, ANSWER],
  completed: [],
  rejected: [],
};

type ChipColor = "info" | "secondary" | "warning" | "success" | "error" | "default";

/** Status → i18n key and MUI chip colour, so every screen labels alike. */
export const STATUS_META: Record<RequestStatus, { labelKey: string; color: ChipColor }> = {
  new: { labelKey: "requests.status.new", color: "info" },
  accepted: { labelKey: "requests.status.accepted", color: "secondary" },
  in_progress: { labelKey: "requests.status.in_progress", color: "warning" },
  completed: { labelKey: "requests.status.completed", color: "success" },
  rejected: { labelKey: "requests.status.rejected", color: "error" },
  returned: { labelKey: "requests.status.returned", color: "default" },
};
