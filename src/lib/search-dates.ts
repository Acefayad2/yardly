export const FLEX_DAYS = [0, 1, 2, 3, 7, 14] as const;
export type FlexibleSearch = { month: string; days: "any" | "weekdays" | "weekends" };
export function parseFlexible(month: string | null, days: string | null): FlexibleSearch | undefined {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
  return { month, days: days === "weekdays" || days === "weekends" ? days : "any" };
}
export function flexibleDates(selection: FlexibleSearch, today: string) {
  const start = new Date(`${selection.month}-01T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return [];
  const dates: string[] = [];
  for (let day = 0; day < 31; day++) {
    const candidate = new Date(start);
    candidate.setUTCDate(1 + day);
    const key = candidate.toISOString().slice(0, 10);
    if (!key.startsWith(selection.month) || key < today) continue;
    const weekend = [0, 6].includes(candidate.getUTCDay());
    if (selection.days === "weekdays" && weekend || selection.days === "weekends" && !weekend) continue;
    dates.push(key);
  }
  return dates;
}
export function flexibleLabel(selection: FlexibleSearch) {
  const month = new Date(`${selection.month}-01T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  return `${month} · ${selection.days === "any" ? "Any day" : selection.days === "weekdays" ? "Weekdays" : "Weekends"}`;
}
export function parseFlex(value: string | number | null) {
  const days = Number(value);
  return FLEX_DAYS.some((allowed) => allowed === days) ? days : 0;
}
export function validSearchDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function searchDates(value: string, flexibility: number, today: string) {
  if (!validSearchDate(value)) return [];
  const offsets = [0];
  for (let day = 1; day <= parseFlex(flexibility); day++) offsets.push(day, -day);
  return offsets.map((offset) => {
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }).filter((date) => date >= today);
}
export function searchDateLabel(date: string, flexibility = 0) {
  if (!validSearchDate(date)) return "Add a date";
  return `${new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${flexibility ? ` ±${flexibility} days` : ""}`;
}
