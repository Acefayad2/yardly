"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export default function Header() {
  const { user, logout, setAuthOpen } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  function search(e: React.FormEvent) {
    e.preventDefault();
    router.push(query.trim() ? `/?q=${encodeURIComponent(query.trim())}` : "/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border-soft bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
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
          className="mx-auto hidden flex-1 max-w-md items-center rounded-full border border-border py-2 pl-5 pr-2 shadow-sm transition hover:border-brand/30 hover:shadow-md md:flex"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by city or neighborhood"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            aria-label="Search spaces"
          />
          <button
            type="submit"
            className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white transition hover:bg-brand-dark"
            aria-label="Search"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth={3}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" strokeLinecap="round" />
            </svg>
          </button>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href="/#discover"
            className="grid h-10 w-10 place-items-center rounded-full border border-border transition hover:border-brand/30 hover:bg-surface-soft md:hidden"
            aria-label="Search Yardly spaces"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth={2.25} aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" strokeLinecap="round" />
            </svg>
          </Link>

          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="hidden rounded-full px-4 py-2.5 text-sm font-semibold transition hover:bg-surface-soft active:scale-[0.98] lg:block"
          >
            Become a host
          </button>

          <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-border py-1.5 pl-2.5 pr-1.5 transition hover:border-brand/30 hover:shadow-md"
            aria-label="Open account and navigation menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-sm font-semibold text-white">
              {user ? user.name.charAt(0).toUpperCase() : (
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white/90"><path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 6v1h18v-1c0-3.5-4-6-9-6z" /></svg>
              )}
            </span>
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation menu"
              />
              <div className="absolute right-0 top-12 z-20 w-60 overflow-hidden rounded-2xl border border-border-soft bg-background py-2 shadow-xl animate-fade-in" role="menu">
                {user ? (
                  <>
                    <div className="px-4 py-2 text-sm">
                      <p className="font-semibold">{user.name}</p>
                      <p className="truncate text-muted">{user.email}</p>
                    </div>
                    <div className="my-1 border-t border-border-soft" />
                    <MenuLink href="/bookings" onClick={() => setMenuOpen(false)}>My bookings</MenuLink>
                    <MenuLink href="/wishlists" onClick={() => setMenuOpen(false)}>Saved spaces</MenuLink>
                    <button
                      onClick={() => { logout(); setMenuOpen(false); }}
                      className="block w-full px-4 py-2.5 text-left text-sm hover:bg-border-soft"
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setAuthOpen(true); setMenuOpen(false); }}
                      className="block w-full px-4 py-2.5 text-left text-sm font-semibold hover:bg-border-soft"
                    >
                      Log in
                    </button>
                    <button
                      onClick={() => { setAuthOpen(true); setMenuOpen(false); }}
                      className="block w-full px-4 py-2.5 text-left text-sm hover:bg-border-soft"
                    >
                      Sign up
                    </button>
                    <div className="my-1 border-t border-border-soft" />
                    <button
                      onClick={() => { setAuthOpen(true); setMenuOpen(false); }}
                      className="block w-full px-4 py-2.5 text-left text-sm hover:bg-border-soft lg:hidden"
                    >
                      Become a host
                    </button>
                    <MenuLink href="/bookings" onClick={() => setMenuOpen(false)}>My bookings</MenuLink>
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

function MenuLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="block px-4 py-2.5 text-sm hover:bg-border-soft">
      {children}
    </Link>
  );
}
