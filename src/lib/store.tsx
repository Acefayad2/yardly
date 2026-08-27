"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import {
  Booking,
  HostListing,
  HostListingStatus,
  HostReservation,
  User,
} from "./types";

interface Store {
  user: User | null;
  bookings: Booking[];
  favorites: string[];
  hostListings: HostListing[];
  hostReservations: HostReservation[];
  login: (name: string, email: string) => void;
  logout: () => void;
  addBooking: (b: Booking) => void;
  cancelBooking: (id: string) => void;
  toggleFavorite: (listingId: string) => void;
  addHostListing: (listing: HostListing) => void;
  setHostListingStatus: (id: string, status: HostListingStatus) => void;
  authOpen: boolean;
  setAuthOpen: (v: boolean) => void;
}

const StoreContext = createContext<Store | null>(null);

const USER_KEY = "yardly_user";
const BOOKINGS_KEY = "yardly_bookings";
const FAVS_KEY = "yardly_favorites";
const HOST_LISTINGS_KEY = "yardly_host_listings";
const HOST_RESERVATIONS_KEY = "yardly_host_reservations";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [hostListings, setHostListings] = useState<HostListing[]>([]);
  const [hostReservations, setHostReservations] = useState<HostReservation[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const u = localStorage.getItem(USER_KEY);
        const b = localStorage.getItem(BOOKINGS_KEY);
        const f = localStorage.getItem(FAVS_KEY);
        const hl = localStorage.getItem(HOST_LISTINGS_KEY);
        const hr = localStorage.getItem(HOST_RESERVATIONS_KEY);
        if (u) setUser(JSON.parse(u));
        if (b) setBookings(JSON.parse(b));
        if (f) setFavorites(JSON.parse(f));
        if (hl) setHostListings(JSON.parse(hl));
        if (hr) setHostReservations(JSON.parse(hr));
      } catch {}
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
  }, [bookings, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(FAVS_KEY, JSON.stringify(favorites));
  }, [favorites, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(HOST_LISTINGS_KEY, JSON.stringify(hostListings));
  }, [hostListings, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(HOST_RESERVATIONS_KEY, JSON.stringify(hostReservations));
  }, [hostReservations, hydrated]);

  const login = useCallback((name: string, email: string) => {
    const u = { name, email };
    setUser(u);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setAuthOpen(false);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(USER_KEY);
  }, []);

  const addBooking = useCallback((b: Booking) => {
    setBookings((prev) => [b, ...prev]);
  }, []);

  const cancelBooking = useCallback((id: string) => {
    setBookings((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const toggleFavorite = useCallback((listingId: string) => {
    setFavorites((prev) =>
      prev.includes(listingId)
        ? prev.filter((x) => x !== listingId)
        : [...prev, listingId]
    );
  }, []);

  const addHostListing = useCallback((listing: HostListing) => {
    setHostListings((prev) => [listing, ...prev]);
  }, []);

  const setHostListingStatus = useCallback((id: string, status: HostListingStatus) => {
    setHostListings((prev) => prev.map((listing) => (
      listing.id === id ? { ...listing, status } : listing
    )));
  }, []);

  return (
    <StoreContext.Provider
      value={{
        user,
        bookings,
        favorites,
        hostListings,
        hostReservations,
        login,
        logout,
        addBooking,
        cancelBooking,
        toggleFavorite,
        addHostListing,
        setHostListingStatus,
        authOpen,
        setAuthOpen,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
