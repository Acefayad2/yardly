"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { Booking, User } from "./types";

interface Store {
  user: User | null;
  bookings: Booking[];
  favorites: string[];
  login: (name: string, email: string) => void;
  logout: () => void;
  addBooking: (b: Booking) => void;
  cancelBooking: (id: string) => void;
  toggleFavorite: (listingId: string) => void;
  authOpen: boolean;
  setAuthOpen: (v: boolean) => void;
}

const StoreContext = createContext<Store | null>(null);

const USER_KEY = "abnb_user";
const BOOKINGS_KEY = "abnb_bookings";
const FAVS_KEY = "abnb_favorites";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const u = localStorage.getItem(USER_KEY);
      const b = localStorage.getItem(BOOKINGS_KEY);
      const f = localStorage.getItem(FAVS_KEY);
      if (u) setUser(JSON.parse(u));
      if (b) setBookings(JSON.parse(b));
      if (f) setFavorites(JSON.parse(f));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
  }, [bookings, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(FAVS_KEY, JSON.stringify(favorites));
  }, [favorites, hydrated]);

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

  return (
    <StoreContext.Provider
      value={{
        user,
        bookings,
        favorites,
        login,
        logout,
        addBooking,
        cancelBooking,
        toggleFavorite,
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
