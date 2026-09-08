"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { getSupabase } from "./supabase";
import type {
  Booking,
  Conversation,
  ConversationMessage,
  HostListing,
  HostListingStatus,
  HostReservation,
  Space,
  User,
} from "./types";

type AuthMode = "login" | "signup";
type ActionResult = { error?: string; message?: string; id?: string };
type NewHostListing = Omit<HostListing, "id" | "image" | "images" | "createdAt">;
type NewBooking = Pick<Booking, "spaceId" | "date" | "startTime" | "endTime" | "guests">;

interface Store {
  user: User | null;
  authLoading: boolean;
  spaces: Space[];
  marketplaceLoading: boolean;
  marketplaceError: string | null;
  bookings: Booking[];
  bookingsLoading: boolean;
  bookingsError: string | null;
  favorites: string[];
  conversations: Conversation[];
  conversationsLoading: boolean;
  conversationsError: string | null;
  hostListings: HostListing[];
  hostReservations: HostReservation[];
  hostDataLoading: boolean;
  hostDataError: string | null;
  login: (mode: AuthMode, name: string, email: string, password: string, phone: string, dateOfBirth: string) => Promise<ActionResult>;
  logout: () => Promise<void>;
  refreshMarketplace: () => Promise<void>;
  addBooking: (booking: NewBooking) => Promise<ActionResult>;
  cancelBooking: (id: string) => Promise<ActionResult>;
  toggleFavorite: (listingId: string) => void;
  addHostListing: (listing: NewHostListing, photos: File[]) => Promise<ActionResult>;
  setHostListingStatus: (id: string, status: HostListingStatus) => Promise<void>;
  startConversation: (listingId: string) => Promise<ActionResult>;
  sendMessage: (conversationId: string, body: string) => Promise<ActionResult>;
  authOpen: boolean;
  setAuthOpen: (value: boolean) => void;
}

const StoreContext = createContext<Store | null>(null);

const FAVS_KEY = "yardly_favorites";
const IOS_AUTH_REDIRECT = "com.acefayad.yardly://auth/callback";
const FALLBACK_LISTING_IMAGE = "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=1200&q=85";

const LISTING_SELECT = "id,host_id,title,location,neighborhood,timezone,space_type,hourly_price,day_price,min_hours,capacity,description,amenities,rules,images,latitude,longitude,status,host_display_name,host_avatar_url,created_at";
const GUEST_RESERVATION_SELECT = "id,listing_id,listing_title,listing_location,listing_image,listing_timezone,start_at,end_at,guests,total,host_payout,status,created_at";
const HOST_RESERVATION_SELECT = `${GUEST_RESERVATION_SELECT},listings!inner(host_id)`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(true);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [hostListings, setHostListings] = useState<HostListing[]>([]);
  const [hostReservations, setHostReservations] = useState<HostReservation[]>([]);
  const [hostDataLoading, setHostDataLoading] = useState(true);
  const [hostDataError, setHostDataError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const refreshMarketplace = useCallback(async () => {
    setMarketplaceLoading(true);
    setMarketplaceError(null);
    try {
      const { data, error } = await getSupabase()
        .from("listings")
        .select(LISTING_SELECT)
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSpaces((data ?? []).flatMap((row) => {
        const mapped = mapSpace(row);
        return mapped ? [mapped] : [];
      }));
    } catch (error) {
      setMarketplaceError(errorMessage(error));
    } finally {
      setMarketplaceLoading(false);
    }
  }, []);

  const loadHostData = useCallback(async (hostId: string) => {
    setHostDataLoading(true);
    setHostDataError(null);
    try {
      const supabase = getSupabase();
      const [listingsResult, reservationsResult] = await Promise.all([
        supabase.from("listings").select(LISTING_SELECT).eq("host_id", hostId).order("created_at", { ascending: false }),
        supabase.from("reservations").select(HOST_RESERVATION_SELECT).eq("listings.host_id", hostId).order("start_at", { ascending: true }),
      ]);
      if (listingsResult.error) throw listingsResult.error;
      if (reservationsResult.error) throw reservationsResult.error;
      setHostListings((listingsResult.data ?? []).map(mapListing));
      setHostReservations((reservationsResult.data ?? []).map(mapHostReservation));
    } catch (error) {
      setHostDataError(errorMessage(error));
    } finally {
      setHostDataLoading(false);
    }
  }, []);

  const loadGuestBookings = useCallback(async (guestId: string) => {
    setBookingsLoading(true);
    setBookingsError(null);
    try {
      const { data, error } = await getSupabase()
        .from("reservations")
        .select(GUEST_RESERVATION_SELECT)
        .eq("guest_id", guestId)
        .order("start_at", { ascending: false });
      if (error) throw error;
      setBookings((data ?? []).map(mapBooking));
    } catch (error) {
      setBookingsError(errorMessage(error));
    } finally {
      setBookingsLoading(false);
    }
  }, []);

  const loadConversations = useCallback(async (userId: string) => {
    setConversationsLoading(true);
    setConversationsError(null);
    try {
      const supabase = getSupabase();
      const { data: threads, error: threadsError } = await supabase
        .from("conversations")
        .select("id,listing_id,guest_id,host_id,updated_at,listings!inner(title,images)")
        .or(`guest_id.eq.${userId},host_id.eq.${userId}`)
        .order("updated_at", { ascending: false });
      if (threadsError) throw threadsError;

      const threadIds = (threads ?? []).map((thread) => String(thread.id));
      const messagesResult = threadIds.length
        ? await supabase.from("messages").select("id,conversation_id,sender_id,body,created_at").in("conversation_id", threadIds).order("created_at", { ascending: true })
        : { data: [], error: null };
      if (messagesResult.error) throw messagesResult.error;

      const messages = (messagesResult.data ?? []).map(mapMessage);
      setConversations((threads ?? []).map((thread) => mapConversation(thread, messages)));
    } catch (error) {
      setConversationsError(errorMessage(error));
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  const applySession = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setUser(null);
      setFavorites(readStoredFavorites());
      setBookings([]);
      setConversations([]);
      setHostListings([]);
      setHostReservations([]);
      setHostDataLoading(false);
      return;
    }

    const nextUser = mapUser(session.user);
    setUser(nextUser);
    const phoneNumber = String(session.user.user_metadata.phone_number || "");
    const dateOfBirth = String(session.user.user_metadata.date_of_birth || "");
    const profile: Record<string, string> = {
      id: nextUser.id,
      full_name: nextUser.name,
      account_type: "both",
    };
    if (phoneNumber) profile.phone_number = phoneNumber;
    if (dateOfBirth) profile.date_of_birth = dateOfBirth;

    const supabase = getSupabase();
    const { error: profileError } = await supabase.from("profiles").upsert(profile);
    if (profileError) setHostDataError(profileError.message);

    const storedFavorites = readStoredFavorites();
    if (storedFavorites.length) {
      const { error } = await supabase.from("saved_listings").upsert(
        storedFavorites.map((listingKey) => ({ user_id: nextUser.id, listing_key: listingKey })),
        { onConflict: "user_id,listing_key" },
      );
      if (!error) localStorage.removeItem(FAVS_KEY);
    }

    const { data: savedListings, error: favoritesError } = await supabase
      .from("saved_listings")
      .select("listing_key")
      .eq("user_id", nextUser.id);
    if (!favoritesError) setFavorites((savedListings ?? []).map(({ listing_key }) => String(listing_key)));

    await Promise.all([
      loadHostData(nextUser.id),
      loadGuestBookings(nextUser.id),
      loadConversations(nextUser.id),
    ]);
  }, [loadConversations, loadGuestBookings, loadHostData]);

  useEffect(() => {
    queueMicrotask(() => void refreshMarketplace());
  }, [refreshMarketplace]);

  useEffect(() => {
    const supabase = getSupabase();
    let disposed = false;
    let removeAppUrlListener: (() => Promise<void>) | undefined;
    queueMicrotask(() => setFavorites(readStoredFavorites()));

    void supabase.auth.getSession()
      .then(({ data }) => applySession(data.session))
      .finally(() => setAuthLoading(false));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => void applySession(session).finally(() => setAuthLoading(false)));
    });

    if (Capacitor.isNativePlatform()) {
      void App.addListener("appUrlOpen", ({ url }) => {
        const code = new URL(url).searchParams.get("code");
        if (code) void supabase.auth.exchangeCodeForSession(code);
      }).then((handle) => {
        if (disposed) void handle.remove();
        else removeAppUrlListener = () => handle.remove();
      });
    }

    return () => {
      disposed = true;
      listener.subscription.unsubscribe();
      void removeAppUrlListener?.();
    };
  }, [applySession]);

  useEffect(() => {
    if (!user) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`yardly-messages-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void loadConversations(user.id);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadConversations, user]);

  const login = useCallback(async (mode: AuthMode, name: string, email: string, password: string, phone: string, dateOfBirth: string): Promise<ActionResult> => {
    try {
      const supabase = getSupabase();
      if (mode === "signup") {
        const phoneNumber = normalizePhone(phone);
        if (!phoneNumber) return { error: "Enter a valid phone number, including the country code." };
        if (!isValidDateOfBirth(dateOfBirth)) return { error: "Enter a valid date of birth." };
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name.trim(), phone_number: phoneNumber, date_of_birth: dateOfBirth },
            emailRedirectTo: Capacitor.isNativePlatform() ? IOS_AUTH_REDIRECT : window.location.origin,
          },
        });
        if (error) throw error;
        if (!data.session) return { message: "Check your email to confirm your Yardly account, then log in." };
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

  const addBooking = useCallback(async (booking: NewBooking): Promise<ActionResult> => {
    if (!user) return { error: "Sign in before reserving a space." };
    try {
      const { data, error } = await getSupabase().rpc("create_reservation", {
        p_listing_id: booking.spaceId,
        p_booking_date: booking.date,
        p_start_time: booking.startTime,
        p_end_time: booking.endTime,
        p_guests: booking.guests,
      });
      if (error) throw error;
      await Promise.all([loadGuestBookings(user.id), loadHostData(user.id)]);
      return { id: String(data.id) };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [loadGuestBookings, loadHostData, user]);

  const cancelBooking = useCallback(async (id: string): Promise<ActionResult> => {
    if (!user) return { error: "Sign in before cancelling a reservation." };
    try {
      const { error } = await getSupabase().rpc("cancel_reservation", { p_reservation_id: id });
      if (error) throw error;
      await Promise.all([loadGuestBookings(user.id), loadHostData(user.id)]);
      return {};
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [loadGuestBookings, loadHostData, user]);

  const toggleFavorite = useCallback((listingId: string) => {
    const wasSaved = favorites.includes(listingId);
    const nextFavorites = wasSaved ? favorites.filter((id) => id !== listingId) : [...favorites, listingId];
    setFavorites(nextFavorites);
    if (!user) {
      localStorage.setItem(FAVS_KEY, JSON.stringify(nextFavorites));
      return;
    }

    const request = wasSaved
      ? getSupabase().from("saved_listings").delete().eq("user_id", user.id).eq("listing_key", listingId)
      : getSupabase().from("saved_listings").insert({ user_id: user.id, listing_key: listingId });
    void request.then(({ error }) => {
      if (error) setFavorites(favorites);
    });
  }, [favorites, user]);

  const addHostListing = useCallback(async (listing: NewHostListing, photos: File[]): Promise<ActionResult> => {
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
        host_display_name: user.name,
        title: listing.title,
        location: listing.location,
        neighborhood: listing.neighborhood,
        timezone: listing.timezone,
        space_type: listing.spaceType,
        hourly_price: listing.hourlyPrice,
        min_hours: listing.minHours,
        capacity: listing.capacity,
        description: listing.description,
        amenities: listing.amenities,
        rules: listing.rules,
        latitude: listing.latitude,
        longitude: listing.longitude,
        images: uploadedImages,
        status: listing.status,
      }).select(LISTING_SELECT).single();

      if (error) throw error;
      setHostListings((previous) => [mapListing(data), ...previous]);
      return photoFailures ? { message: "The draft was saved, but one or more photos could not be uploaded." } : {};
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [user]);

  const setHostListingStatus = useCallback(async (id: string, status: HostListingStatus) => {
    if (!user) return;
    const listing = hostListings.find((item) => item.id === id);
    if (status === "published" && listing && (!listing.images.length || listing.latitude === null || listing.longitude === null)) {
      setHostDataError("Add at least one photo and map coordinates before publishing.");
      return;
    }
    const previous = hostListings;
    setHostDataError(null);
    setHostListings((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    const { error } = await getSupabase().from("listings").update({ status }).eq("id", id).eq("host_id", user.id);
    if (error) {
      setHostListings(previous);
      setHostDataError(error.message);
      return;
    }
    await refreshMarketplace();
  }, [hostListings, refreshMarketplace, user]);

  const startConversation = useCallback(async (listingId: string): Promise<ActionResult> => {
    if (!user) return { error: "Sign in to message this host." };
    const space = spaces.find((item) => item.id === listingId);
    if (!space) return { error: "This listing is not available." };
    if (space.hostId === user.id) return { error: "This is your listing." };
    try {
      const supabase = getSupabase();
      const { data: existing, error: findError } = await supabase
        .from("conversations")
        .select("id")
        .eq("listing_id", listingId)
        .eq("guest_id", user.id)
        .eq("host_id", space.hostId)
        .maybeSingle();
      if (findError) throw findError;
      if (existing) return { id: String(existing.id) };

      const { data, error } = await supabase.from("conversations").insert({
        listing_id: listingId,
        guest_id: user.id,
        host_id: space.hostId,
      }).select("id").single();
      if (error) throw error;
      await loadConversations(user.id);
      return { id: String(data.id) };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [loadConversations, spaces, user]);

  const sendMessage = useCallback(async (conversationId: string, body: string): Promise<ActionResult> => {
    if (!user) return { error: "Sign in to send a message." };
    const message = body.trim();
    if (!message) return { error: "Write a message first." };
    try {
      const { error } = await getSupabase().from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body: message,
      });
      if (error) throw error;
      await loadConversations(user.id);
      return {};
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [loadConversations, user]);

  return (
    <StoreContext.Provider value={{
      user,
      authLoading,
      spaces,
      marketplaceLoading,
      marketplaceError,
      bookings,
      bookingsLoading,
      bookingsError,
      favorites,
      conversations,
      conversationsLoading,
      conversationsError,
      hostListings,
      hostReservations,
      hostDataLoading,
      hostDataError,
      login,
      logout,
      refreshMarketplace,
      addBooking,
      cancelBooking,
      toggleFavorite,
      addHostListing,
      setHostListingStatus,
      startConversation,
      sendMessage,
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

function mapSpace(row: Record<string, unknown>): Space | null {
  const images = stringArray(row.images);
  const latitude = nullableNumber(row.latitude);
  const longitude = nullableNumber(row.longitude);
  if (!images.length || latitude === null || longitude === null) return null;
  return {
    id: String(row.id),
    hostId: String(row.host_id),
    title: String(row.title),
    location: String(row.location),
    neighborhood: String(row.neighborhood || ""),
    timezone: String(row.timezone || "America/New_York"),
    spaceType: String(row.space_type) as Space["spaceType"],
    hourlyPrice: Number(row.hourly_price),
    dayPrice: Number(row.day_price || 0),
    minHours: Number(row.min_hours || 1),
    rating: 0,
    reviews: 0,
    capacity: Number(row.capacity),
    acres: 0,
    topHost: false,
    lat: latitude,
    lng: longitude,
    images,
    host: {
      name: String(row.host_display_name || "Yardly host"),
      since: new Date(String(row.created_at)).getUTCFullYear().toString(),
      avatar: String(row.host_avatar_url || FALLBACK_LISTING_IMAGE),
      responseRate: 100,
    },
    description: String(row.description || ""),
    amenities: stringArray(row.amenities),
    rules: stringArray(row.rules),
  };
}

function mapListing(row: Record<string, unknown>): HostListing {
  const images = stringArray(row.images);
  return {
    id: String(row.id),
    title: String(row.title),
    location: String(row.location),
    neighborhood: String(row.neighborhood || ""),
    timezone: String(row.timezone || "America/New_York"),
    spaceType: String(row.space_type) as HostListing["spaceType"],
    hourlyPrice: Number(row.hourly_price),
    minHours: Number(row.min_hours || 1),
    capacity: Number(row.capacity),
    description: String(row.description || ""),
    amenities: stringArray(row.amenities),
    rules: stringArray(row.rules),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    images,
    image: images[0] || FALLBACK_LISTING_IMAGE,
    status: String(row.status) as HostListingStatus,
    createdAt: String(row.created_at),
  };
}

function mapBooking(row: Record<string, unknown>): Booking {
  const start = new Date(String(row.start_at));
  const end = new Date(String(row.end_at));
  const timezone = String(row.listing_timezone || "America/New_York");
  const local = localDateParts(start, timezone);
  return {
    id: String(row.id),
    spaceId: String(row.listing_id),
    title: String(row.listing_title || "Yardly space"),
    image: String(row.listing_image || FALLBACK_LISTING_IMAGE),
    location: String(row.listing_location || ""),
    date: local.date,
    startTime: local.time,
    endTime: localDateParts(end, timezone).time,
    hours: Math.round((end.getTime() - start.getTime()) / 3_600_000),
    fullDay: false,
    guests: Number(row.guests),
    total: Number(row.total),
    status: String(row.status) as Booking["status"],
    createdAt: String(row.created_at),
  };
}

function mapHostReservation(row: Record<string, unknown>): HostReservation {
  const start = new Date(String(row.start_at));
  const end = new Date(String(row.end_at));
  const timezone = String(row.listing_timezone || "America/New_York");
  const local = localDateParts(start, timezone);
  const databaseStatus = String(row.status);
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    listingTitle: String(row.listing_title || "Yardly space"),
    guestName: "Yardly guest",
    date: local.date,
    startTime: local.time,
    endTime: localDateParts(end, timezone).time,
    guests: Number(row.guests),
    payout: Number(row.host_payout),
    status: databaseStatus === "cancelled" ? "cancelled" : databaseStatus === "completed" ? "completed" : "upcoming",
  };
}

function mapMessage(row: Record<string, unknown>): ConversationMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    body: String(row.body),
    createdAt: String(row.created_at),
  };
}

function mapConversation(row: Record<string, unknown>, messages: ConversationMessage[]): Conversation {
  const listing = relation(row.listings);
  const images = stringArray(listing.images);
  const id = String(row.id);
  return {
    id,
    listingId: String(row.listing_id),
    listingTitle: String(listing.title || "Yardly space"),
    listingImage: images[0] || FALLBACK_LISTING_IMAGE,
    guestId: String(row.guest_id),
    hostId: String(row.host_id),
    updatedAt: String(row.updated_at),
    messages: messages.filter((message) => message.conversationId === id),
  };
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const normalized = value.trim().startsWith("+") ? `+${digits}` : digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

function isValidDateOfBirth(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  const today = new Date();
  const earliest = new Date("1900-01-01T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date >= earliest && date <= today;
}

function readStoredFavorites(): string[] {
  try {
    const value = localStorage.getItem(FAVS_KEY);
    return value ? JSON.parse(value).filter((item: unknown) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function relation(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return (value[0] ?? {}) as Record<string, unknown>;
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function localDateParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Something went wrong. Please try again.";
}
