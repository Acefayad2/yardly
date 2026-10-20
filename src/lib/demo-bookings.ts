import { DEMO_SPACES } from "./demo-spaces";

export const DEMO_BOOKINGS_KEY = "yardly-demo-bookings-v1";
export const DEMO_BOOKINGS_EVENT = "yardly-demo-bookings-changed";
export type DemoBooking = {
  id: string;
  spaceId: string;
  date: string;
  startHour: number;
  hours: number;
  guests: number;
  status: "confirmed" | "cancelled";
};

export function validDemoBooking(value: unknown): value is DemoBooking {
  if (!value || typeof value !== "object") return false;
  const b = value as DemoBooking;
  const space = DEMO_SPACES.find((item) => item.id === b.spaceId);
  return !!space && typeof b.id === "string" && /^DEMO-[a-f0-9-]{36}$/.test(b.id)
    && typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date)
    && !Number.isNaN(Date.parse(b.date)) && new Date(b.date).toISOString().slice(0, 10) === b.date
    && Number.isInteger(b.startHour) && b.startHour >= 8 && b.startHour < 22
    && Number.isInteger(b.hours) && b.hours >= space.minHours && b.startHour + b.hours <= 22
    && Number.isInteger(b.guests) && b.guests >= 1 && b.guests <= space.capacity
    && (b.status === "confirmed" || b.status === "cancelled");
}

export function readDemoBookings(): DemoBooking[] {
  try {
    const data: unknown = JSON.parse(sessionStorage.getItem(DEMO_BOOKINGS_KEY) ?? "[]");
    return Array.isArray(data) ? data.filter(validDemoBooking).slice(0, 10) : [];
  } catch { return []; }
}

export function saveDemoBookings(bookings: DemoBooking[]) {
  sessionStorage.setItem(DEMO_BOOKINGS_KEY, JSON.stringify(bookings.filter(validDemoBooking).slice(0, 10)));
  window.dispatchEvent(new Event(DEMO_BOOKINGS_EVENT));
}
