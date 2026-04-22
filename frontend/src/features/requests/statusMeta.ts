import type { RequestStatus } from "@/features/requests/requestsApi";

export const STATUS_COLOR: Record<RequestStatus, string> = {
  new: "#3B82F6",
  accepted: "#8B5CF6",
  in_progress: "#F59E0B",
  completed: "#10B981",
  rejected: "#EF4444",
  returned: "#64748B",
};

export const PRIORITY_COLOR: Record<string, string> = {
  low: "#64748B",
  normal: "#3B82F6",
  high: "#F59E0B",
  critical: "#EF4444",
};

export const STATUS_ORDER: RequestStatus[] = [
  "new",
  "accepted",
  "in_progress",
  "returned",
  "completed",
  "rejected",
];
