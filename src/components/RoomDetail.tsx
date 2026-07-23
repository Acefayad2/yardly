"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Listing } from "@/lib/types";
import BookingWidget from "./BookingWidget";
import { useStore } from "@/lib/store";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

export default function RoomDetail({ listing }: { listing: Listing }) {
  const { favorites, toggleFavorite } = useStore();
  const isFav = favorites.includes(listing.id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold sm:text-3xl">{listing.title}</h1>
        <button
          onClick={() => toggleFavorite(listing.id)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium underline hover:bg-border-soft"
        >
          <svg viewBox="0 0 24 24" className={`h-4 w-4 ${isFav ? "fill-rausch stroke-rausch" : "fill-none stroke-current"}`} strokeWidth={2}>
            <path d="M12 21s-7.5-4.6-10-9.2C.5 8.3 2 5 5.2 5c2 0 3.3 1.2 4.3 2.6l1.5 2 1.5-2C13.5 6.2 14.8 5 16.8 5 20 5 21.5 8.3 22 11.8 19.5 16.4 12 21 12 21z" />
          </svg>
          {isFav ? "Saved" : "Save"}
        </button>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
        <span className="flex items-center gap-1 font-medium">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z" /></svg>
          {listing.rating.toFixed(2)}
        </span>
        <span className="text-muted">· {listing.reviews} reviews ·</span>
        {listing.superhost && <span className="font-medium">Superhost ·</span>}
        <span className="font-medium underline">{listing.location}</span>
      </p>

      {/* Gallery */}
      <div className="mt-5 grid grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl" style={{ height: 420 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={listing.images[0]} alt="" className="col-span-2 row-span-2 h-full w-full object-cover" />
        {listing.images.slice(1, 5).map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" className="h-full w-full object-cover" />
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-10 lg:flex-row">
        <div className="lg:w-[58%]">
          <div className="flex items-center justify-between border-b border-border-soft pb-6">
            <div>
              <h2 className="text-xl font-semibold">
                Hosted by {listing.host.name}
              </h2>
              <p className="text-muted">
                {listing.guests} guests · {listing.bedrooms} bedrooms · {listing.beds} beds · {listing.baths} baths
              </p>
              <p className="mt-1 text-sm text-muted">Superhost since {listing.host.since}</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={listing.host.avatar} alt={listing.host.name} className="h-14 w-14 rounded-full object-cover" />
          </div>

          <p className="border-b border-border-soft py-6 leading-relaxed">{listing.description}</p>

          <div className="border-b border-border-soft py-6">
            <h3 className="mb-4 text-lg font-semibold">What this place offers</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {listing.amenities.map((a) => (
                <div key={a} className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth={2}><path d="M5 12l4 4 10-11" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="text-sm">{a}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="py-6">
            <h3 className="mb-4 text-lg font-semibold">Where you&apos;ll be</h3>
            <p className="mb-4 text-sm text-muted">{listing.location}, {listing.country}</p>
            <div className="h-72 overflow-hidden rounded-2xl">
              <MapView listings={[listing]} activeId={listing.id} />
            </div>
          </div>
        </div>

        <div className="lg:w-[42%]">
          <div className="sticky top-24">
            <BookingWidget listing={listing} />
          </div>
        </div>
      </div>

      <div className="mt-10">
        <Link href="/" className="text-sm font-semibold underline">← Back to all stays</Link>
      </div>
    </div>
  );
}
