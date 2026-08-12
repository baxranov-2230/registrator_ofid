/** Shared role metadata and helpers for the two user directories. */

export const ROLES = ["student", "registrator", "staff", "admin", "leadership"] as const;
export type RoleName = (typeof ROLES)[number];

/** Roles that are not students — the "Xodimlar" page owns these. */
export const STAFF_ROLES = ["registrator", "staff", "admin", "leadership"] as const;

export const ROLE_COLORS: Record<RoleName, string> = {
  admin: "#EF4444",
  leadership: "#8B5CF6",
  registrator: "#3B82F6",
  staff: "#10B981",
  student: "#64748B",
};

/** Two-letter monogram for the avatar fallback. */
export function initials(name: string): string {
  return (name || "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
