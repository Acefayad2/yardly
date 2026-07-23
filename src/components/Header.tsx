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
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-rausch shrink-0">
          <svg viewBox="0 0 32 32" className="h-8 w-8 fill-current" aria-hidden>
            <path d="M16 1c2.6 0 4.7 2.1 4.7 4.7 0 1-.3 2-.9 3.1l-.2.4-3.6 7 5.2 11.1c.6 1.3-.3 2.8-1.7 2.9h-.2c-.6 0-1.2-.3-1.6-.8L16 28l-1.7 2.4c-.4.5-1 .8-1.6.8-1.5 0-2.5-1.5-1.9-2.9L16 16l-.6-1.3-.6 1.3 4.9 10.4c.2.5-.1 1-.6 1h-.1c-.2 0-.5-.1-.6-.4L16 22l-2.3 5c-.1.3-.4.4-.6.4-.6 0-.9-.5-.7-1L16 5.9c-.5-1-1-1.6-1.6-1.9-.4-.2-.9-.3-1.4-.3-1.4 0-2.6 1.1-2.6 2.6 0 .6.2 1.3.6 2.1L16 24l-4.6-9.8C10.5 12.4 10 11 10 9.7 10 5.9 12.9 3 16.7 3" />
          </svg>
          <span className="hidden text-xl font-bold tracking-tight sm:block">
            stayscape
          </span>
        </Link>

        <form
          onSubmit={search}
          className="flex flex-1 max-w-md items-center rounded-full border border-border py-2 pl-5 pr-2 shadow-sm transition hover:shadow-md"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search destinations"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            aria-label="Search destinations"
          />
          <button
            type="submit"
            className="grid h-8 w-8 place-items-center rounded-full bg-rausch text-white transition hover:bg-rausch-dark"
            aria-label="Search"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth={3}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" strokeLinecap="round" />
            </svg>
          </button>
        </form>

        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-3 rounded-full border border-border py-1.5 pl-3 pr-1.5 transition hover:shadow-md"
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
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-20 w-56 overflow-hidden rounded-2xl border border-border-soft bg-background py-2 shadow-xl animate-fade-in">
                {user ? (
                  <>
                    <div className="px-4 py-2 text-sm">
                      <p className="font-semibold">{user.name}</p>
                      <p className="truncate text-muted">{user.email}</p>
                    </div>
                    <div className="my-1 border-t border-border-soft" />
                    <MenuLink href="/trips" onClick={() => setMenuOpen(false)}>My trips</MenuLink>
                    <MenuLink href="/wishlists" onClick={() => setMenuOpen(false)}>Wishlists</MenuLink>
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
                    <MenuLink href="/trips" onClick={() => setMenuOpen(false)}>My trips</MenuLink>
                  </>
                )}
              </div>
            </>
          )}
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
