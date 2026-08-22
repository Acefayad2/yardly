"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import MobileSearch from "./MobileSearch";

export default function Header() {
  const { user, logout, setAuthOpen } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [guests, setGuests] = useState("");
  const router = useRouter();

  function search(e: React.FormEvent) {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const location = String(form.get("q") ?? "").trim();
    const selectedDate = String(form.get("date") ?? "");
    const guestCount = String(form.get("guests") ?? "");
    const params = new URLSearchParams();
    if (location) params.set("q", location);
    if (selectedDate) params.set("date", selectedDate);
    if (guestCount) params.set("guests", guestCount);
    router.push(params.size ? `/?${params.toString()}#discover` : "/#discover");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border-soft bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[90rem] items-center gap-3 px-4 py-3 sm:px-6 lg:gap-5 lg:py-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-brand" aria-label="Yardly home">
          <svg viewBox="0 0 32 32" className="h-8 w-8 fill-current" aria-hidden>
            <path d="M16 2C16 8 12 10 9 12c-4 2.7-5 8-2.4 11.6C8.3 26 11 27 13.6 26.4 12.4 22 13 17.4 16 14c-2 4-2.3 8.4-1.4 12.9.3 1.5.6 2.4.6 3.1h1.6c0-.7.3-1.6.6-3.1.4-1.9.5-3.7.4-5.4 1.6 1 3.7 1.2 5.6.6C26 20.9 27 15.6 24.4 12 21.4 8 16 8 16 2z" />
          </svg>
          <span className="text-lg font-bold tracking-tight sm:text-xl">
            Yardly
          </span>
        </Link>

        <form
          onSubmit={search}
          className="header-search mx-auto hidden min-w-0 flex-1 lg:grid"
          aria-label="Search Yardly spaces"
        >
          <label className="header-search__field header-search__field--where">
            <span>Where</span>
            <input
              value={query}
              name="q"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search destinations"
              aria-label="Where"
            />
          </label>
          <label className="header-search__field">
            <span>When</span>
            <input
              type="date"
              name="date"
              aria-label="When"
            />
          </label>
          <label className="header-search__field">
            <span>Who</span>
            <select name="guests" value={guests} onChange={(e) => setGuests(e.target.value)} aria-label="Who">
              <option value="">Add guests</option>
              {Array.from({ length: 60 }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>{count} {count === 1 ? "guest" : "guests"}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="header-search__submit"
            aria-label="Search"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" strokeLinecap="round" />
            </svg>
          </button>
        </form>

        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 lg:flex-none">
          <MobileSearch />

          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="hidden rounded-full px-3 py-2.5 text-sm font-semibold transition hover:bg-surface-soft active:scale-[0.98] lg:block"
          >
            Become a host
          </button>

          <div className="relative">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="header-utility-button header-language-button"
                aria-label="Language and region: English"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="header-utility-button"
                aria-label="Open account and navigation menu"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 7h14M5 12h14M5 17h14" />
                </svg>
                {user && <span className="header-utility-button__badge">{user.name.charAt(0).toUpperCase()}</span>}
              </button>
            </div>

          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation menu"
              />
              <div className="account-menu animate-fade-in" role="menu">
                {user ? (
                  <>
                    <div className="account-menu__profile">
                      <span>{user.name.charAt(0).toUpperCase()}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{user.name}</p>
                        <p className="truncate text-sm text-muted">{user.email}</p>
                      </div>
                    </div>
                    <div className="account-menu__divider" />
                    <MenuLink href="/bookings" onClick={() => setMenuOpen(false)}>Bookings</MenuLink>
                    <MenuLink href="/wishlists" onClick={() => setMenuOpen(false)}>Wishlists</MenuLink>
                    <MenuLink href="/messages" onClick={() => setMenuOpen(false)}>Messages</MenuLink>
                    <div className="account-menu__divider" />
                    <button
                      onClick={() => { logout(); setMenuOpen(false); }}
                      className="account-menu__link"
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <MenuLink href="/trust" onClick={() => setMenuOpen(false)} icon="help">Help Center</MenuLink>
                    <div className="account-menu__divider" />
                    <button type="button" className="account-menu__host" onClick={() => { setAuthOpen(true); setMenuOpen(false); }}>
                      <strong>Become a host</strong>
                      <span>It&apos;s easy to start hosting and earn extra income.</span>
                    </button>
                    <div className="account-menu__divider" />
                    <button type="button" className="account-menu__link" onClick={() => { setAuthOpen(true); setMenuOpen(false); }}>Refer a host</button>
                    <button type="button" className="account-menu__link" onClick={() => { setAuthOpen(true); setMenuOpen(false); }}>Find a co-host</button>
                    <button type="button" className="account-menu__link" onClick={() => { setAuthOpen(true); setMenuOpen(false); }}>Gift cards</button>
                    <div className="account-menu__divider" />
                    <button type="button" className="account-menu__link" onClick={() => { setAuthOpen(true); setMenuOpen(false); }}>Log in or sign up</button>
                  </>
                )}
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </header>
  );
}

function MenuLink({ href, children, onClick, icon }: { href: string; children: React.ReactNode; onClick: () => void; icon?: "help" }) {
  return (
    <Link href={href} onClick={onClick} className="account-menu__link">
      {icon === "help" && (
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.8 9.2a2.4 2.4 0 0 1 4.6.9c0 2-2.4 2.1-2.4 4M12 17.3h.01" /></svg>
      )}
      {children}
    </Link>
  );
}
