import Link from "next/link";

const links = [
  { label: "How Yardly works", href: "/trust#how-it-works" },
  { label: "Safety", href: "/trust#safety" },
  { label: "Booking policies", href: "/trust#booking-policies" },
  { label: "Privacy", href: "/trust#privacy" },
];

export default function Footer() {
  return (
    <footer className="border-t border-border-soft bg-surface-soft">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 md:grid-cols-[1.2fr_1fr] md:items-end">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-brand" aria-label="Yardly home">
            <svg viewBox="0 0 32 32" className="h-8 w-8 fill-current" aria-hidden="true">
              <path d="M16 2C16 8 12 10 9 12c-4 2.7-5 8-2.4 11.6C8.3 26 11 27 13.6 26.4 12.4 22 13 17.4 16 14c-2 4-2.3 8.4-1.4 12.9.3 1.5.6 2.4.6 3.1h1.6c0-.7.3-1.6.6-3.1.4-1.9.5-3.7.4-5.4 1.6 1 3.7 1.2 5.6.6C26 20.9 27 15.6 24.4 12 21.4 8 16 8 16 2z" />
            </svg>
            <span className="text-xl font-bold tracking-tight">Yardly</span>
          </Link>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted">
            Private backyards, pools, gardens, and outdoor spaces—booked by the hour for the moments that need more room.
          </p>
        </div>

        <nav aria-label="Footer navigation" className="md:justify-self-end">
          <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="transition hover:text-brand focus-visible:text-brand">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-muted md:text-right">© {new Date().getFullYear()} Yardly</p>
        </nav>
      </div>
    </footer>
  );
}
