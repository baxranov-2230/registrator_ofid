interface ValidationItem {
  loc?: Array<string | number>;
  msg?: string;
  type?: string;
}

export function formatApiError(err: unknown, fallback = "Xato"): string {
  if (!err) return fallback;
  const data = (err as { data?: { detail?: unknown } }).data;
  const detail = data?.detail;

  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return (detail as ValidationItem[])
      .map((d) => {
        const path = Array.isArray(d.loc)
          ? d.loc.filter((p) => p !== "body").join(".")
          : "";
        return path ? `${path}: ${d.msg ?? ""}` : d.msg ?? "";
      })
      .filter(Boolean)
      .join("; ") || fallback;
  }
  if (detail && typeof detail === "object") {
    const msg = (detail as { msg?: string }).msg;
    if (msg) return msg;
  }
  const status = (err as { status?: number | string }).status;
  if (status) return `${fallback} (${status})`;
  return fallback;
}
