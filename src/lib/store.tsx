"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { getSupabase } from "./supabase";
import { errorMessage } from "./errors";
import { DEMO_SPACES } from "./demo-spaces";
import type {
  AccountType,
  AppMode,
  Booking,
  Conversation,
  ConversationMessage,
  HostListing,
  HostListingStatus,
  HostReservation,
  ListingImagePlanEntry,
  Space,
  User,
} from "./types";

type AuthMode = "login" | "signup";
type StoredMode = { userId: string; mode: AppMode };
type ActionResult = { error?: string; message?: string; id?: string };
type NewHostListing = Omit<HostListing, "id" | "image" | "images" | "createdAt">;
type UploadProgress = (done: number, total: number) => void;
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
  accountType: AccountType;
  canHost: boolean;
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  login: (mode: AuthMode, name: string, email: string, password: string, phone: string, dateOfBirth: string) => Promise<ActionResult>;
  logout: () => Promise<void>;
  refreshMarketplace: () => Promise<void>;
  refreshHostData: () => Promise<void>;
  addBooking: (booking: NewBooking) => Promise<ActionResult>;
  cancelBooking: (id: string) => Promise<ActionResult>;
  toggleFavorite: (listingId: string) => void;
  addHostListing: (listing: NewHostListing, imagePlan: ListingImagePlanEntry[], onProgress?: UploadProgress) => Promise<ActionResult>;
  updateHostListing: (id: string, listing: NewHostListing, imagePlan: ListingImagePlanEntry[], onProgress?: UploadProgress) => Promise<ActionResult>;
  setHostListingStatus: (id: string, status: HostListingStatus) => Promise<void>;
  startConversation: (listingId: string) => Promise<ActionResult>;
  sendMessage: (conversationId: string, body: string) => Promise<ActionResult>;
  authOpen: boolean;
  setAuthOpen: (value: boolean) => void;
}

const StoreContext = createContext<Store | null>(null);

const FAVS_KEY = "yardly_favorites";
const MODE_KEY = "yardly_mode";
const IOS_AUTH_REDIRECT = "com.acefayad.yardly://auth/callback";
const FALLBACK_LISTING_IMAGE = "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=1200&q=85";

const LISTING_SELECT = "id,host_id,title,location,neighborhood,timezone,space_type,hourly_price,day_price,min_hours,capacity,description,amenities,rules,images,latitude,longitude,status,host_display_name,host_avatar_url,created_at";
// Host-only read: embeds the private address, which RLS only ever returns for the listing's own host.
const HOST_LISTING_SELECT = `${LISTING_SELECT},listing_addresses(street_address)`;
const GUEST_RESERVATION_SELECT = "id,listing_id,listing_title,listing_location,listing_image,listing_timezone,start_at,end_at,guests,total,host_payout,status,created_at";
const HOST_RESERVATION_SELECT = `${GUEST_RESERVATION_SELECT},listings!inner(host_id)`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
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
  const [accountType, setAccountType] = useState<AccountType>("guest");
  const [storedMode, setStoredMode] = useState<StoredMode | null>(null);
  // Only an explicit login/signup may reroute the user; a silent session restore must not.
  const interactiveLogin = useRef(false);

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
      const publishedSpaces = (data ?? []).flatMap((row) => {
        const mapped = mapSpace(row);
        return mapped ? [mapped] : [];
      });
      setSpaces(publishedSpaces.length ? publishedSpaces : DEMO_SPACES);
    } catch (error) {
      setMarketplaceError(errorMessage(error, "load marketplace"));
    } finally {
      setMarketplaceLoading(false);
    }
  }, []);

  const loadHostData = useCallback(async (hostId: string): Promise<HostListing[]> => {
    setHostDataLoading(true);
    setHostDataError(null);
    try {
      const supabase = getSupabase();
      const [listingsResult, reservationsResult] = await Promise.all([
        supabase.from("listings").select(HOST_LISTING_SELECT).eq("host_id", hostId).order("created_at", { ascending: false }),
        supabase.from("reservations").select(HOST_RESERVATION_SELECT).eq("listings.host_id", hostId).order("start_at", { ascending: true }),
      ]);
      if (listingsResult.error) throw listingsResult.error;
      if (reservationsResult.error) throw reservationsResult.error;
      const listings = (listingsResult.data ?? []).map(mapListing);
      setHostListings(listings);
      setHostReservations((reservationsResult.data ?? []).map(mapHostReservation));
      return listings;
    } catch (error) {
      setHostDataError(errorMessage(error, "load host data"));
      return [];
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
      setBookingsError(errorMessage(error, "load bookings"));
    } finally {
      setBookingsLoading(false);
    }
  }, []);

  const refreshHostData = useCallback(async () => {
    if (user) await loadHostData(user.id);
  }, [loadHostData, user]);

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
      setConversationsError(errorMessage(error, "load conversations"));
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
      setAccountType("guest");
      interactiveLogin.current = false;
      return;
    }

    const nextUser = mapUser(session.user);
    setUser(nextUser);
    const phoneNumber = String(session.user.user_metadata.phone_number || "");
    const dateOfBirth = String(session.user.user_metadata.date_of_birth || "");
    // account_type is deliberately absent: PostgREST only builds ON CONFLICT DO UPDATE
    // for the keys present here, so a new row takes the column's 'guest' default and an
    // existing row keeps whatever it already has instead of being reset on every sync.
    const profile: Record<string, string> = {
      id: nextUser.id,
      full_name: nextUser.name,
    };
    if (phoneNumber) profile.phone_number = phoneNumber;
    if (dateOfBirth) profile.date_of_birth = dateOfBirth;

    const supabase = getSupabase();
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .upsert(profile)
      .select("account_type")
      .single();
    if (profileError) setHostDataError(errorMessage(profileError, "profile sync"));
    // Falling back to "guest" only ever hides the host switcher from a host; it can
    // never hand hosting UI to someone who has not hosted.
    let nextAccountType = toAccountType(profileRow?.account_type);
    setAccountType(nextAccountType);

    const storedFavorites = readStoredFavorites();
    if (storedFavorites.length) {
      const { error } = await supabase.from("saved_listings").upsert(
        storedFavorites.map((listingKey) => ({ user_id: nextUser.id, listing_key: listingKey })),
        { onConflict: "user_id,listing_key", ignoreDuplicates: true },
      );
      if (!error) localStorage.removeItem(FAVS_KEY);
    }

    const { data: savedListings, error: favoritesError } = await supabase
      .from("saved_listings")
      .select("listing_key")
      .eq("user_id", nextUser.id);
    if (!favoritesError) setFavorites((savedListings ?? []).map(({ listing_key }) => String(listing_key)));

    const [listings] = await Promise.all([
      loadHostData(nextUser.id),
      loadGuestBookings(nextUser.id),
      loadConversations(nextUser.id),
    ]);

    // Self-heal: someone who owns listings is a host even if an earlier flip failed.
    if (nextAccountType === "guest" && listings.length) {
      const { error } = await supabase.from("profiles").update({ account_type: "both" }).eq("id", nextUser.id);
      if (!error) {
        nextAccountType = "both";
        setAccountType("both");
      }
    }

    const wasInteractive = interactiveLogin.current;
    interactiveLogin.current = false;
    if (!wasInteractive || nextAccountType === "guest") return;
    const remembered = readStoredMode();
    if (remembered?.userId !== nextUser.id || remembered.mode !== "hosting") return;
    // Only from the entry pages. A deep link to a listing, the reset-password screen or
    // the iOS auth callback must survive login untouched.
    const path = window.location.pathname;
    if (path === "/" || path === "/host" || path === "/host/") router.push("/host/dashboard/");
  }, [loadConversations, loadGuestBookings, loadHostData, router]);

  useEffect(() => {
    queueMicrotask(() => void refreshMarketplace());
  }, [refreshMarketplace]);

  useEffect(() => {
    const supabase = getSupabase();
    let disposed = false;
    let removeAppUrlListener: (() => Promise<void>) | undefined;
    queueMicrotask(() => {
      setFavorites(readStoredFavorites());
      setStoredMode(readStoredMode());
    });

    void supabase.auth.getSession()
      .then(({ data }) => applySession(data.session))
      .finally(() => setAuthLoading(false));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && !window.location.pathname.startsWith("/reset-password")) {
        queueMicrotask(() => router.push("/reset-password/"));
      }
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
  }, [applySession, router]);

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
      interactiveLogin.current = true;
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
        if (!data.session) {
          interactiveLogin.current = false;
          return { message: "Check your email to confirm your Yardly account, then log in." };
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      setAuthOpen(false);
      return {};
    } catch (error) {
      interactiveLogin.current = false;
      return { error: errorMessage(error, "login") };
    }
  }, []);

  const logout = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) setHostDataError(errorMessage(error, "sign out"));
  }, []);

  const addBooking = useCallback(async (booking: NewBooking): Promise<ActionResult> => {
    if (!user) return { error: "Sign in before reserving a space." };
    if (spaces.some((space) => space.id === booking.spaceId && space.isDemo)) {
      return { error: "Demo listings are for preview only and cannot be reserved." };
    }
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
      return { error: errorMessage(error, "add booking") };
    }
  }, [loadGuestBookings, loadHostData, spaces, user]);

  const cancelBooking = useCallback(async (id: string): Promise<ActionResult> => {
    if (!user) return { error: "Sign in before cancelling a reservation." };
    try {
      const { error } = await getSupabase().rpc("cancel_reservation", { p_reservation_id: id });
      if (error) throw error;
      await Promise.all([loadGuestBookings(user.id), loadHostData(user.id)]);
      return {};
    } catch (error) {
      return { error: errorMessage(error, "cancel booking") };
    }
  }, [loadGuestBookings, loadHostData, user]);

  const canHost = accountType !== "guest";
  // Derived rather than reset in an effect: a sign-out, a different user or losing the
  // host capability all fall back to "traveling" without a synchronous setState.
  const mode: AppMode = canHost && user && storedMode?.userId === user.id ? storedMode.mode : "traveling";

  const setMode = useCallback((next: AppMode) => {
    if (!user) return;
    const entry = { userId: user.id, mode: next };
    writeStoredMode(entry);
    setStoredMode(entry);
  }, [user]);

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

  const addHostListing = useCallback(async (listing: NewHostListing, imagePlan: ListingImagePlanEntry[], onProgress?: UploadProgress): Promise<ActionResult> => {
    if (!user) return { error: "Sign in before saving a listing." };
    setHostDataError(null);
    try {
      const supabase = getSupabase();
      const listingId = crypto.randomUUID();
      const { images: uploadedImages, photoFailures } = await uploadImagePlan(supabase, user.id, listingId, imagePlan, onProgress);

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
      let addressFailed = false;
      if (listing.streetAddress) {
        const { error: addressError } = await supabase
          .from("listing_addresses")
          .upsert({ listing_id: listingId, street_address: listing.streetAddress });
        addressFailed = Boolean(addressError);
      }
      setHostListings((previous) => [{ ...mapListing(data), streetAddress: addressFailed ? null : (listing.streetAddress || null) }, ...previous]);

      // First listing turns the account into a host. This unlocks hosting UI only —
      // listing access is already granted by ownership in RLS, never by this flag.
      if (accountType === "guest") {
        const { error: accountError } = await supabase.from("profiles").update({ account_type: "both" }).eq("id", user.id);
        if (!accountError) setAccountType("both");
      }

      const messages = [
        photoFailures ? "one or more photos could not be uploaded" : null,
        addressFailed ? "the private address could not be saved" : null,
      ].filter(Boolean);
      return messages.length ? { message: `The draft was saved, but ${messages.join(" and ")}.` } : {};
    } catch (error) {
      return { error: errorMessage(error, "add host listing") };
    }
  }, [accountType, user]);

  const updateHostListing = useCallback(async (id: string, listing: NewHostListing, imagePlan: ListingImagePlanEntry[], onProgress?: UploadProgress): Promise<ActionResult> => {
    if (!user) return { error: "Sign in before editing a listing." };
    setHostDataError(null);
    try {
      const supabase = getSupabase();
      // The plan already carries every kept existing image (in the host's chosen order)
      // plus any new files -- no need to separately merge against the stored listing.
      const { images, photoFailures } = await uploadImagePlan(supabase, user.id, id, imagePlan, onProgress);

      const { data, error } = await supabase.from("listings").update({
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
        images,
      }).eq("id", id).eq("host_id", user.id).select(LISTING_SELECT).single();

      if (error) throw error;
      let addressFailed = false;
      if (listing.streetAddress) {
        const { error: addressError } = await supabase
          .from("listing_addresses")
          .upsert({ listing_id: id, street_address: listing.streetAddress });
        addressFailed = Boolean(addressError);
      }
      setHostListings((previous) => previous.map((item) => (item.id === id ? { ...mapListing(data), streetAddress: addressFailed ? null : (listing.streetAddress || item.streetAddress) } : item)));
      if (String(data.status) === "published") await refreshMarketplace();
      const messages = [
        photoFailures ? "one or more photos could not be uploaded" : null,
        addressFailed ? "the private address could not be saved" : null,
      ].filter(Boolean);
      return messages.length ? { message: `Your changes were saved, but ${messages.join(" and ")}.` } : {};
    } catch (error) {
      return { error: errorMessage(error, "update host listing") };
    }
  }, [refreshMarketplace, user]);

  const setHostListingStatus = useCallback(async (id: string, status: HostListingStatus) => {
    if (!user) return;
    const listing = hostListings.find((item) => item.id === id);
    // Mirrors listings_published_complete (images/lat/long/description/neighborhood)
    // and the private-address trigger exactly, field by field, so a host sees a
    // specific reason instead of the database's generic constraint-violation fallback.
    if (status === "published" && listing) {
      const publishIssue = !listing.images.length ? "Add at least one photo before publishing."
        : listing.latitude === null || listing.longitude === null ? "Add a map location before publishing."
        : !listing.streetAddress ? "Add a private street address before publishing this listing."
        : listing.description.trim().length < 20 ? "Write at least 20 characters in your description before publishing."
        : !listing.neighborhood.trim() ? "Add a neighborhood before publishing."
        : null;
      if (publishIssue) {
        setHostDataError(publishIssue);
        return;
      }
    }
    const previous = hostListings;
    setHostDataError(null);
    setHostListings((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    const { error } = await getSupabase().from("listings").update({ status }).eq("id", id).eq("host_id", user.id);
    if (error) {
      setHostListings(previous);
      setHostDataError(errorMessage(error, "listing status"));
      return;
    }
    await refreshMarketplace();
  }, [hostListings, refreshMarketplace, user]);

  const startConversation = useCallback(async (listingId: string): Promise<ActionResult> => {
    if (!user) return { error: "Sign in to message this host." };
    const space = spaces.find((item) => item.id === listingId);
    if (!space) return { error: "This listing is not available." };
    if (space.isDemo) return { error: "Demo listings do not have a live host to message." };
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
      return { error: errorMessage(error, "start conversation") };
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
      return { error: errorMessage(error, "send message") };
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
      accountType,
      canHost,
      mode,
      setMode,
      login,
      logout,
      refreshMarketplace,
      refreshHostData,
      addBooking,
      cancelBooking,
      toggleFavorite,
      addHostListing,
      updateHostListing,
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

function toAccountType(value: unknown): AccountType {
  return value === "host" || value === "both" ? value : "guest";
}

// Walks the plan in the host's chosen order, uploading each "new" file as it's reached
// and using "existing" URLs as-is, so the final images array reflects exactly the order
// (and cover photo) the host set -- not "existing first, new appended after". A failed
// upload drops that one entry (order of the rest is preserved) and is counted, never
// aborts the rest of the plan. onProgress only counts new uploads, since "existing"
// entries need no network work.
async function uploadImagePlan(
  supabase: SupabaseClient,
  userId: string,
  listingId: string,
  plan: ListingImagePlanEntry[],
  onProgress?: UploadProgress,
): Promise<{ images: string[]; photoFailures: number }> {
  const images: string[] = [];
  let photoFailures = 0;
  const totalNew = plan.filter((entry) => entry.kind === "new").length;
  let uploaded = 0;

  for (const entry of plan.slice(0, 8)) {
    if (entry.kind === "existing") {
      images.push(entry.url);
      continue;
    }
    const safeName = entry.file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const path = `${userId}/${listingId}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from("listing-images").upload(path, entry.file, {
      cacheControl: "3600",
      contentType: entry.file.type,
      upsert: false,
    });
    if (error) {
      photoFailures += 1;
    } else {
      images.push(supabase.storage.from("listing-images").getPublicUrl(path).data.publicUrl);
    }
    uploaded += 1;
    onProgress?.(uploaded, totalNew);
  }

  return { images, photoFailures };
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
    streetAddress: streetAddressFromEmbed(row.listing_addresses),
    images,
    image: images[0] || FALLBACK_LISTING_IMAGE,
    status: String(row.status) as HostListingStatus,
    createdAt: String(row.created_at),
  };
}

// PostgREST returns a to-one embed as an object when it can infer the unique
// FK (listing_addresses.listing_id is its own primary key), but falls back to
// an array in some query shapes — handle both. Absent entirely when the host
// has never saved an address (RLS still returns the parent row).
function streetAddressFromEmbed(value: unknown): string | null {
  const record = Array.isArray(value) ? value[0] : value;
  if (!record || typeof record !== "object") return null;
  const address = (record as Record<string, unknown>).street_address;
  return typeof address === "string" && address.trim() ? address : null;
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

// Keyed by user so a second account signing in on a shared browser does not
// inherit the previous person's hosting mode.
function readStoredMode(): StoredMode | null {
  try {
    const value = localStorage.getItem(MODE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value);
    if (typeof parsed?.userId !== "string") return null;
    return { userId: parsed.userId, mode: parsed.mode === "hosting" ? "hosting" : "traveling" };
  } catch {
    return null;
  }
}

function writeStoredMode(next: StoredMode): void {
  try {
    localStorage.setItem(MODE_KEY, JSON.stringify(next));
  } catch {
    // A blocked or full localStorage only costs the remembered mode; ignore it.
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

