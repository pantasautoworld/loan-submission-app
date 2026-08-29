export const MALAYSIA_TZ = "Asia/Kuala_Lumpur";

/** The year/month/day currently in Malaysia, regardless of the server's own timezone. */
export function malaysiaDateParts(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MALAYSIA_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** ISO instant for midnight Malaysia time at the start of the given year/month (Malaysia is UTC+8, no DST). */
export function malaysiaMonthStartIso(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1) - 8 * 60 * 60 * 1000).toISOString();
}

/** Today's date in Malaysia as "YYYY-MM-DD", for defaulting a `type="date"` input. */
export function malaysiaTodayIso(date: Date = new Date()): string {
  const { year, month, day } = malaysiaDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
