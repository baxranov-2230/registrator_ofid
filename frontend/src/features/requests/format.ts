import type { TFunction } from "i18next";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "29.09.2026, 09:34" — the format the office reads, whatever the browser
 * locale. `toLocaleString()` rendered US dates with seconds ("9/29/2026,
 * 9:34:16 AM"), which nobody here parses at a glance.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A span as "1 kun 3 soat" / "2 soat 15 daqiqa" / "40 daqiqa". */
export function formatDuration(ms: number, t: TFunction): string {
  const totalMinutes = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    const d = t("requests.durDays", { n: days });
    return hours > 0 ? `${d} ${t("requests.durHours", { n: hours })}` : d;
  }
  if (hours > 0) {
    const h = t("requests.durHours", { n: hours });
    return minutes > 0 ? `${h} ${t("requests.durMinutes", { n: minutes })}` : h;
  }
  return t("requests.durMinutes", { n: minutes });
}
