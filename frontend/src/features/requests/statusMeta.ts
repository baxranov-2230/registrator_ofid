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

export const STATUS_ORDER: RequestStatus[] = [
  "new",
  "accepted",
  "in_progress",
  "returned",
  "completed",
  "rejected",
];

/**
 * The pipeline a request walks in the normal case. `returned` and `rejected`
 * are deliberately absent: they are detours off this line, not stops on it, and
 * the stepper renders them as a separate state instead of a numbered step.
 */
export const PROGRESS_STEPS: RequestStatus[] = [
  "new",
  "accepted",
  "in_progress",
  "completed",
];

/** Index of a status on the happy path, or -1 for the off-path states. */
export function progressIndex(status: RequestStatus): number {
  return PROGRESS_STEPS.indexOf(status);
}

type ButtonColor = "primary" | "success" | "warning" | "error" | "inherit";

/**
 * A transition presented as an action the user takes, rather than a target
 * state they must pick out of a dropdown. `labelKey` uses the verb form
 * ("Qabul qilish"), so the button says what pressing it does.
 */
export interface TransitionAction {
  to: RequestStatus;
  labelKey: string;
  color: ButtonColor;
  /** Require a reason before allowing the action — refusals need explaining. */
  commentRequired?: boolean;
}

const ACCEPT: TransitionAction = {
  to: "accepted",
  labelKey: "requests.accept",
  color: "primary",
};
const START: TransitionAction = {
  to: "in_progress",
  labelKey: "requests.startWork",
  color: "primary",
};
const COMPLETE: TransitionAction = {
  to: "completed",
  labelKey: "requests.complete",
  color: "success",
};
const REJECT: TransitionAction = {
  to: "rejected",
  labelKey: "requests.reject",
  color: "error",
  commentRequired: true,
};
const RETURN: TransitionAction = {
  to: "returned",
  labelKey: "requests.return",
  color: "warning",
  commentRequired: true,
};

/**
 * Mirrors `_ALLOWED_TRANSITIONS` in the backend request service. The server
 * remains the authority — this only decides which buttons to render.
 */
export const TRANSITION_ACTIONS: Record<RequestStatus, TransitionAction[]> = {
  new: [ACCEPT, RETURN, REJECT],
  accepted: [START, RETURN, REJECT],
  in_progress: [COMPLETE, RETURN, REJECT],
  returned: [ACCEPT],
  completed: [],
  rejected: [],
};

/** Returning a request to the student is a triage privilege (backend A-02). */
export function canRunAction(action: TransitionAction, role: string | undefined): boolean {
  if (action.to === "returned") return role === "registrator" || role === "admin";
  return true;
}

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
