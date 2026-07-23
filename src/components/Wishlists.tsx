"use client";

import Link from "next/link";
import { SPACES } from "@/lib/spaces";
import { useStore } from "@/lib/store";
import SpaceCard from "./SpaceCard";

export default function Wishlists() {
  const { favorites } = useStore();
  const saved = SPACES.filter((s) => favorites.includes(s.id));

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 animate-fade-in">
      <h1 className="text-3xl font-semibold">Saved spaces</h1>
      {saved.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-border p-10 text-center">
          <p className="text-lg font-semibold">No saved spaces yet</p>
          <p className="mt-1 text-muted">Tap the heart on any space to save it here.</p>
          <Link href="/" className="mt-5 inline-block rounded-xl border border-foreground px-6 py-3 text-sm font-semibold hover:bg-border-soft">
            Explore spaces
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {saved.map((s) => (
            <SpaceCard key={s.id} space={s} />
          ))}
        </div>
      )}
    </div>
  );
}
