"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { format } from "date-fns";
import { SPACES } from "@/lib/spaces";
import { useStore } from "@/lib/store";
import type { Space } from "@/lib/types";
import type { TripMapPoint } from "./TripsMap";

const TripsMap = dynamic(() => import("./TripsMap"), {
  ssr: false,
  loading: () => <div className="trips-map trips-map--loading" aria-label="Loading trip map" />,
});

interface Trip {
  id: string;
  space: Space;
  scheduleLabel: string;
  guestInitials: string[];
  additionalGuests: number;
}

const SAMPLE_TRIPS: Trip[] = [
  {
    id: "sample-la",
    space: SPACES[0],
    scheduleLabel: "Sep 12, 2026 · 2 PM – 6 PM",
    guestInitials: ["A", "M", "J"],
    additionalGuests: 3,
  },
  {
    id: "sample-phx",
    space: SPACES[1],
    scheduleLabel: "Oct 3, 2026 · 11 AM – 3 PM",
    guestInitials: ["K", "D", "S"],
    additionalGuests: 2,
  },
  {
    id: "sample-austin",
    space: SPACES[2],
    scheduleLabel: "Nov 7, 2026 · 5 PM – 9 PM",
    guestInitials: ["E", "C", "T"],
    additionalGuests: 2,
  },
];

const AVATAR_COLORS = ["#dff2e5", "#ede6fb", "#fff0d2", "#dcecf8"];

export default function Trips() {
  const { bookings } = useStore();
  const bookedTrips = bookings.flatMap<Trip>((booking) => {
    const space = SPACES.find((candidate) => candidate.id === booking.spaceId);
    if (!space) return [];
    return [{
      id: booking.id,
      space,
      scheduleLabel: `${format(new Date(`${booking.date}T12:00:00`), "MMM d, yyyy")} · ${tripTimeLabel(booking.startTime)} – ${tripTimeLabel(booking.endTime)}`,
      guestInitials: ["Y", "G"].slice(0, Math.min(booking.guests, 2)),
      additionalGuests: Math.max(booking.guests - 2, 0),
    }];
  });

  const trips = bookedTrips.length ? bookedTrips.slice(0, 3) : SAMPLE_TRIPS;
  const mapPoints: TripMapPoint[] = trips.map(({ id, space }) => ({
    id,
    label: space.location,
    lat: space.lat,
    lng: space.lng,
    image: space.images[0],
  }));

  return (
    <div className="trips-page animate-fade-in">
      <TripsMap points={mapPoints} />

      <section className="trips-sheet" aria-labelledby="trips-title">
        <div className="trips-sheet__handle" aria-hidden="true" />
        <h1 id="trips-title">Trips</h1>

        <div className="trips-list">
          {trips.map((trip) => (
            <Link key={trip.id} href={`/spaces/${trip.space.id}`} className="trip-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={trip.space.images[0]} alt={trip.space.title} className="trip-card__image" />
              <div className="trip-card__content">
                <h2>{trip.space.location.split(",")[0]}</h2>
                <p>{trip.scheduleLabel}</p>
                <div className="trip-card__guests" aria-label={`${trip.guestInitials.length + trip.additionalGuests} guests`}>
                  {trip.guestInitials.map((initial, index) => (
                    <span key={`${initial}-${index}`} style={{ backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] }}>{initial}</span>
                  ))}
                  {trip.additionalGuests > 0 && <span className="trip-card__guest-count">+{trip.additionalGuests}</span>}
                </div>
              </div>
              <span className="trip-card__arrow" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>

        <details className="canceled-trips">
          <summary>
            <span className="canceled-trips__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16M9 13l6 4M15 13l-6 4" /></svg>
            </span>
            <strong>Canceled reservations</strong>
            <span className="canceled-trips__arrow" aria-hidden="true">›</span>
          </summary>
          <p>No canceled reservations.</p>
        </details>
      </section>
    </div>
  );
}

function tripTimeLabel(value: string) {
  const hour = Number(value.split(":")[0]);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12} ${suffix}`;
}
