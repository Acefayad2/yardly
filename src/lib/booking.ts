export function bookingQuote(hourlyPrice: number, hours: number) {
  const subtotalCents = Math.round(hourlyPrice * 100) * hours;
  const feeCents = Math.round(subtotalCents * 12 / 100);
  return { subtotal: subtotalCents / 100, serviceFee: feeCents / 100, total: (subtotalCents + feeCents) / 100 };
}

export function bookingStartHour(minHours: number) {
  return Math.max(8, Math.min(14, 22 - minHours));
}

export function listingToday(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}-${parts.find((part) => part.type === "day")!.value}`;
}
