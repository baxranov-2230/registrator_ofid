/** Shared role metadata and helpers for the two user directories. */

export const ROLES = ["student", "registrator", "staff", "admin", "leadership"] as const;
export type RoleName = (typeof ROLES)[number];

/** Roles that are not students — the "Xodimlar" page owns these. */
export const STAFF_ROLES = ["registrator", "staff", "admin", "leadership"] as const;

export const ROLE_COLORS: Record<RoleName, string> = {
  admin: "#DC2626",
  leadership: "#A80BE4",
  registrator: "#2D57FE",
  staff: "#25A194",
  student: "#6C757D",
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
