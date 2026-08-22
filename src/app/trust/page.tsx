import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How Yardly works | Yardly",
  description: "Learn how Yardly bookings, safety expectations, address privacy, and booking policies work.",
};

const sections = [
  {
    id: "how-it-works",
    eyebrow: "A simpler way to gather",
    title: "Find a place, choose your time, make it yours.",
    body: "Browse outdoor spaces by location and guest count, review each host's amenities and rules, then choose an hourly or full-day booking. Your full price is shown before you reserve.",
  },
  {
    id: "safety",
    eyebrow: "Shared responsibility",
    title: "Good bookings start with clear expectations.",
    body: "Every listing shows capacity, amenities, host rules, neighborhood details, and response history. Guests should review those details before booking and contact the host when an event needs special setup or vendors.",
  },
  {
    id: "booking-policies",
    eyebrow: "Know before you go",
    title: "Timing, fees, and rules stay visible.",
    body: "Minimum hours, service fees, guest limits, and the total price are presented during booking. Space-specific rules remain available on the listing so groups can plan around quiet hours, parking, pool use, and cleanup.",
  },
  {
    id: "privacy",
    eyebrow: "Address privacy",
    title: "Explore the neighborhood without exposing the front door.",
    body: "Yardly shows an approximate map location while you browse. The exact address is reserved for confirmed bookings, helping hosts protect their privacy while giving guests enough context to plan.",
  },
];

export default function TrustPage() {
  return (
    <div className="bg-surface-soft">
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-14 sm:pt-20">
        <p className="text-sm font-semibold text-brand-dark">Confidence at every step</p>
        <h1 className="mt-3 max-w-3xl text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
          The details that make an outdoor booking feel easy.
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-lg leading-8 text-muted">
          Yardly keeps the important information close: what the space includes, what it costs, how many people fit, and what the host expects.
        </p>
      </section>

      <div className="mx-auto max-w-5xl px-6 pb-20">
        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            className="grid scroll-mt-28 gap-4 border-t border-border py-10 md:grid-cols-[0.65fr_1.35fr] md:gap-12"
          >
            <div className="text-sm font-semibold text-brand-dark">0{index + 1} · {section.eyebrow}</div>
            <div>
              <h2 className="max-w-2xl text-balance text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                {section.title}
              </h2>
              <p className="mt-4 max-w-2xl text-pretty leading-7 text-muted">{section.body}</p>
            </div>
          </section>
        ))}

        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-dark"
        >
          Browse spaces <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
