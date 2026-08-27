"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import {
  Booking,
  HostListing,
  HostListingStatus,
  HostReservation,
  User,
} from "./types";

type AuthMode = "login" | "signup";
type AuthResult = { error?: string; message?: string };
type NewHostListing = Omit<HostListing, "id" | "image" | "createdAt">;

interface Store {
  user: User | null;
  bookings: Booking[];
  favorites: string[];
  hostListings: HostListing[];
  hostReservations: HostReservation[];
  hostDataLoading: boolean;
  hostDataError: string | null;
  login: (mode: AuthMode, name: string, email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  addBooking: (b: Booking) => void;
  cancelBooking: (id: string) => void;
  toggleFavorite: (listingId: string) => void;
  addHostListing: (listing: NewHostListing, photos: File[]) => Promise<AuthResult>;
  setHostListingStatus: (id: string, status: HostListingStatus) => Promise<void>;
  authOpen: boolean;
  setAuthOpen: (v: boolean) => void;
}

const StoreContext = createContext<Store | null>(null);

const BOOKINGS_KEY = "yardly_bookings";
const FAVS_KEY = "yardly_favorites";
const FALLBACK_LISTING_IMAGE = "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=1200&q=85";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [hostListings, setHostListings] = useState<HostListing[]>([]);
  const [hostReservations, setHostReservations] = useState<HostReservation[]>([]);
  const [hostDataLoading, setHostDataLoading] = useState(true);
  const [hostDataError, setHostDataError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const loadHostData = useCallback(async (hostId: string) => {
    setHostDataLoading(true);
    setHostDataError(null);
    try {
      const supabase = getSupabase();
      const [listingsResult, reservationsResult] = await Promise.all([
        supabase
          .from("listings")
          .select("id,title,location,space_type,hourly_price,capacity,description,amenities,images,status,created_at")
          .eq("host_id", hostId)
          .order("created_at", { ascending: false }),
        supabase
          .from("reservations")
          .select("id,listing_id,start_at,end_at,guests,host_payout,status,listings!inner(title,host_id)")
          .eq("listings.host_id", hostId)
          .order("start_at", { ascending: true }),
      ]);

      if (listingsResult.error) throw listingsResult.error;
      if (reservationsResult.error) throw reservationsResult.error;

      setHostListings((listingsResult.data ?? []).map(mapListing));
      setHostReservations((reservationsResult.data ?? []).map(mapReservation));
    } catch (error) {
      setHostDataError(errorMessage(error));
    } finally {
      setHostDataLoading(false);
    }
  }, []);

  const applySession = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setUser(null);
      setHostListings([]);
      setHostReservations([]);
      setHostDataLoading(false);
      return;
    }

    const nextUser = mapUser(session.user);
    setUser(nextUser);
    await getSupabase().from("profiles").upsert({
      id: nextUser.id,
      full_name: nextUser.name,
      account_type: "both",
    });
    await loadHostData(nextUser.id);
  }, [loadHostData]);

  useEffect(() => {
    const supabase = getSupabase();
    const storedBookings = localStorage.getItem(BOOKINGS_KEY);
    const storedFavorites = localStorage.getItem(FAVS_KEY);
    queueMicrotask(() => {
      try {
        if (storedBookings) setBookings(JSON.parse(storedBookings));
        if (storedFavorites) setFavorites(JSON.parse(storedFavorites));
      } catch {}
      setHydrated(true);
    });

    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => void applySession(session));
    });
    return () => listener.subscription.unsubscribe();
  }, [applySession]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
  }, [bookings, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(FAVS_KEY, JSON.stringify(favorites));
  }, [favorites, hydrated]);

  const login = useCallback(async (mode: AuthMode, name: string, email: string, password: string): Promise<AuthResult> => {
    try {
      const supabase = getSupabase();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (!data.session) {
          return { message: "Check your email to confirm your Yardly account, then log in." };
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      setAuthOpen(false);
      return {};
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, []);

  const logout = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) setHostDataError(error.message);
  }, []);

  const addBooking = useCallback((booking: Booking) => {
    setBookings((previous) => [booking, ...previous]);
  }, []);

  const cancelBooking = useCallback((id: string) => {
    setBookings((previous) => previous.filter((booking) => booking.id !== id));
  }, []);

  const toggleFavorite = useCallback((listingId: string) => {
    setFavorites((previous) => previous.includes(listingId)
      ? previous.filter((id) => id !== listingId)
      : [...previous, listingId]);
  }, []);

  const addHostListing = useCallback(async (listing: NewHostListing, photos: File[]): Promise<AuthResult> => {
    if (!user) return { error: "Sign in before saving a listing." };
    setHostDataError(null);
    try {
      const supabase = getSupabase();
      const listingId = crypto.randomUUID();
      const uploadedImages: string[] = [];
      let photoFailures = 0;

      for (const photo of photos.slice(0, 8)) {
        const safeName = photo.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
        const path = `${user.id}/${listingId}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage.from("listing-images").upload(path, photo, {
          cacheControl: "3600",
          contentType: photo.type,
          upsert: false,
        });
        if (error) {
          photoFailures += 1;
          continue;
        }
        uploadedImages.push(supabase.storage.from("listing-images").getPublicUrl(path).data.publicUrl);
      }

      const { data, error } = await supabase.from("listings").insert({
        id: listingId,
        host_id: user.id,
        title: listing.title,
        location: listing.location,
        space_type: listing.spaceType,
        hourly_price: listing.hourlyPrice,
        capacity: listing.capacity,
        description: listing.description,
        amenities: listing.amenities,
        images: uploadedImages,
        status: listing.status,
      }).select("id,title,location,space_type,hourly_price,capacity,description,amenities,images,status,created_at").single();

      if (error) throw error;
      setHostListings((previous) => [mapListing(data), ...previous]);
      return photoFailures ? { message: "The draft was saved, but one or more photos could not be uploaded." } : {};
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [user]);

  const setHostListingStatus = useCallback(async (id: string, status: HostListingStatus) => {
    if (!user) return;
    const previous = hostListings;
    setHostListings((current) => current.map((listing) => listing.id === id ? { ...listing, status } : listing));
    const { error } = await getSupabase().from("listings").update({ status }).eq("id", id).eq("host_id", user.id);
    if (error) {
      setHostListings(previous);
      setHostDataError(error.message);
    }
  }, [hostListings, user]);

  return (
    <StoreContext.Provider value={{
      user,
      bookings,
      favorites,
      hostListings,
      hostReservations,
      hostDataLoading,
      hostDataError,
      login,
      logout,
      addBooking,
      cancelBooking,
      toggleFavorite,
      addHostListing,
      setHostListingStatus,
      authOpen,
      setAuthOpen,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreProvider");
  return context;
}

function mapUser(user: SupabaseUser): User {
  const email = user.email ?? "";
  return {
    id: user.id,
    email,
    name: String(user.user_metadata.full_name || email.split("@")[0] || "Yardly user"),
  };
}

function mapListing(row: Record<string, unknown>): HostListing {
  const images = Array.isArray(row.images) ? row.images as string[] : [];
  return {
    id: String(row.id),
    title: String(row.title),
    location: String(row.location),
    spaceType: String(row.space_type) as HostListing["spaceType"],
    hourlyPrice: Number(row.hourly_price),
    capacity: Number(row.capacity),
    description: String(row.description),
    amenities: Array.isArray(row.amenities) ? row.amenities as string[] : [],
    image: images[0] || FALLBACK_LISTING_IMAGE,
    status: String(row.status) as HostListingStatus,
    createdAt: String(row.created_at),
  };
}

function mapReservation(row: Record<string, unknown>): HostReservation {
  const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
  const listingTitle = listing && typeof listing === "object" && "title" in listing ? String(listing.title) : "Yardly space";
  const start = new Date(String(row.start_at));
  const end = new Date(String(row.end_at));
  const databaseStatus = String(row.status);
  const status = databaseStatus === "cancelled"
    ? "cancelled"
    : databaseStatus === "completed"
      ? "completed"
      : "upcoming";
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    listingTitle,
    guestName: "Yardly guest",
    date: start.toISOString().slice(0, 10),
    startTime: start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    endTime: end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    guests: Number(row.guests),
    payout: Number(row.host_payout),
    status,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
