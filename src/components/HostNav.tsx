"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/host/dashboard", label: "Today", icon: HomeIcon },
  { href: "/host/reservations", label: "Reservations", icon: CalendarIcon },
  { href: "/host/listings", label: "Listings", icon: ListingIcon },
  { href: "/messages", label: "Messages", icon: MessageIcon },
];

export default function HostNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border-soft bg-white" aria-label="Host navigation">
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 sm:px-6">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${
                active ? "border-brand text-brand-dark" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
        <Link href="/" className="ml-auto hidden shrink-0 rounded-full border border-border-soft px-4 py-2 text-sm font-semibold transition hover:bg-surface-soft sm:block">
          Switch to renting
        </Link>
      </div>
    </nav>
  );
}

function HomeIcon() {
  return <svg className="h-4 w-4 fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7v9H4Z" /><path d="M9 20v-6h6v6" /></svg>;
}

function CalendarIcon() {
  return <svg className="h-4 w-4 fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
}

function ListingIcon() {
  return <svg className="h-4 w-4 fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
}

function MessageIcon() {
  return <svg className="h-4 w-4 fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5 3 21l.7-4A8.5 8.5 0 1 1 12 20.5H8.5" /></svg>;
}
