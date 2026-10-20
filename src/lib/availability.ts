export type WeeklyHours = ([number, number] | null)[];
export type BookingSlot = { start_hour: number; end_hour: number };
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DEFAULT_HOURS: WeeklyHours = WEEKDAYS.map(() => [8, 22]);

export function hourLabel(hour: number) {
  return `${hour % 12 || 12}:00 ${hour >= 12 ? "PM" : "AM"}`;
}

export function scheduleError(hours: WeeklyHours, minimum: number) {
  if (hours.length !== 7 || hours.some((day) => day && (
    !Number.isInteger(day[0]) || !Number.isInteger(day[1]) || day[0] < 8 || day[1] > 22 || day[1] - day[0] < minimum
  ))) return `Each open day needs at least ${minimum} hours, between 8 AM and 10 PM.`;
  return "";
}
