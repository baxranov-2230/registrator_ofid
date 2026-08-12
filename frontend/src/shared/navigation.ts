/**
 * Role → route mapping, in one place.
 *
 * The same request detail component is mounted under four different role
 * prefixes, so several screens need to answer "where does this role open a
 * request?". Keeping the answer here stops the four copies from drifting.
 */

export const ROLE_REQUEST_BASE: Record<string, string> = {
  student: "/student/requests",
  registrator: "/registrator/requests",
  staff: "/staff/requests",
  admin: "/admin/requests",
  leadership: "/admin/requests",
};

export function requestPathForRole(role: string): string {
  return ROLE_REQUEST_BASE[role] ?? "/admin/requests";
}

/** Landing route after login, per role. */
export const ROLE_HOME: Record<string, string> = {
  student: "/student/requests",
  registrator: "/registrator/inbox",
  staff: "/staff/queue",
  admin: "/dashboard",
  leadership: "/dashboard",
};

export function homePathForRole(role: string | undefined): string {
  return (role && ROLE_HOME[role]) || "/dashboard";
}
