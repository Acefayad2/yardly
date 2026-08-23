"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Explore", icon: ExploreIcon },
  { href: "/wishlists", label: "Wishlists", icon: HeartIcon },
  { href: "/", label: "Yardly", icon: YardlyIcon, brand: true },
  { href: "/messages", label: "Messages", icon: MessageIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav md:hidden" aria-label="Primary mobile navigation">
      <div className="bottom-nav__items">
        {items.map(({ href, label, icon: Icon, brand }) => {
          const active = !brand && (href === "/" ? pathname === "/" || pathname.startsWith("/spaces/") : pathname.startsWith(href));

          return (
            <Link
              key={label}
              href={href}
              className={`bottom-nav__item${brand ? " bottom-nav__item--brand" : ""}`}
              aria-current={active ? "page" : undefined}
              aria-label={brand ? "Yardly home" : undefined}
            >
              <span className="bottom-nav__icon" aria-hidden="true"><Icon /></span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ExploreIcon() {
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z" /></svg>;
}

function HeartIcon() {
  return <svg viewBox="0 0 24 24"><path d="M12 20.2s-7.5-4.4-9.4-9C1.4 8.1 3.2 5 6.4 5c2 0 3.5 1.2 4.4 2.6L12 9.4l1.2-1.8C14.1 6.2 15.6 5 17.6 5c3.2 0 5 3.1 3.8 6.2-1.9 4.6-9.4 9-9.4 9Z" /></svg>;
}

function YardlyIcon() {
  return <svg viewBox="0 0 32 32"><path d="M16 2C16 8 12 10 9 12c-4 2.7-5 8-2.4 11.6C8.3 26 11 27 13.6 26.4 12.4 22 13 17.4 16 14c-2 4-2.3 8.4-1.4 12.9.3 1.5.6 2.4.6 3.1h1.6c0-.7.3-1.6.6-3.1.4-1.9.5-3.7.4-5.4 1.6 1 3.7 1.2 5.6.6C26 20.9 27 15.6 24.4 12 21.4 8 16 8 16 2z" /></svg>;
}

function MessageIcon() {
  return <svg viewBox="0 0 24 24"><path d="M5.5 18.5 3 21l.7-4A8.5 8.5 0 1 1 12 20.5H8.5" /><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" /></svg>;
}

function ProfileIcon() {
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.5-4 3-6 7-6s6.5 2 7 6" /></svg>;
}
