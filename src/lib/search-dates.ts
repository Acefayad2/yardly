export const FLEX_DAYS = [0, 1, 2, 3, 7, 14] as const;
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
