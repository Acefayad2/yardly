import { getSupabase } from "./supabase";
import type {
  DirectorySpace,
  Provider,
  ProviderCategory,
  ProviderKind,
  ProviderService,
  ProviderStatus,
  Quote,
  QuoteRequest,
  QuoteRequestItem,
  QuoteRequestStatus,
  RentalItem,
} from "./types";

const FALLBACK_PROVIDER_IMAGE =
  "https://images.unsplash.com/photo-1452587925148-ce544e77e70d?auto=format&fit=crop&w=1200&q=85";

const PROVIDER_SELECT =
  "id,owner_id,kind,category,business_name,tagline,description,service_area,contact_email,contact_phone,starting_price,price_unit,images,status,review_notes,created_at";
const PROVIDER_SERVICE_SELECT =
  "id,provider_id,name,description,starting_price,price_unit,sort_order";
const RENTAL_ITEM_SELECT =
  "id,provider_id,name,description,unit_price,available_quantity,min_quantity,offers_delivery,offers_setup,offers_pickup";
const QUOTE_SELECT =
  "id,quote_request_id,total_price,deposit,includes,cancellation_terms,expires_at,created_at";
const QUOTE_REQUEST_SELECT =
  "id,provider_id,requester_id,listing_id,event_date,event_location,start_time,hours,guest_count,notes,needs_delivery,needs_setup,needs_pickup,status,created_at";
const DIRECTORY_SELECT =
  "id,name,category,location,latitude,longitude,capacity,amenities,pricing_note,restrictions,official_url,booking_contact,last_checked_at";

export const PROVIDER_CATEGORIES: { name: ProviderCategory; icon: string; kind: ProviderKind }[] = [
  { name: "Photography", icon: "📷", kind: "service" },
  { name: "Videography", icon: "🎥", kind: "service" },
  { name: "Catering", icon: "🍲", kind: "service" },
  { name: "Music & DJ", icon: "🎧", kind: "service" },
  { name: "Event staffing", icon: "🧑‍🍳", kind: "service" },
  { name: "Decor & florals", icon: "💐", kind: "service" },
  { name: "Event equipment", icon: "⛺", kind: "rental" },
];

export const QUOTE_STATUS_LABELS: Record<QuoteRequestStatus, string> = {
  awaiting_reply: "Waiting for a reply",
  quoted: "Quoted",
  accepted: "Accepted — awaiting provider",
  confirmed: "Confirmed",
  declined: "Declined",
  closed: "Closed",
};

export interface NewProviderProfile {
  kind: ProviderKind;
  category: ProviderCategory;
  businessName: string;
  tagline: string;
  description: string;
  serviceArea: string;
  contactEmail: string;
  contactPhone: string;
  startingPrice: number;
  priceUnit: Provider["priceUnit"];
  images: string[];
  submitForReview: boolean;
}

export interface NewQuoteRequest {
  providerId: string;
  listingId?: string | null;
  eventDate: string;
  eventLocation: string;
  startTime?: string | null;
  hours?: number | null;
  guestCount: number;
  notes: string;
  needsDelivery?: boolean;
  needsSetup?: boolean;
  needsPickup?: boolean;
  items?: { rentalItemId: string; quantity: number }[];
}

export interface NewQuote {
  quoteRequestId: string;
  totalPrice: number;
  deposit: number;
  includes: string;
  cancellationTerms: string;
  expiresAt?: string | null;
}

export function providerHref(id: string) {
  return `/services?id=${encodeURIComponent(id)}`;
}

export function formatPriceUnit(unit: Provider["priceUnit"]) {
  if (unit === "hour") return "per hour";
  if (unit === "day") return "per day";
  if (unit === "item") return "per item";
  return "per event";
}

/** Published providers, newest first, optionally narrowed to one category. */
export async function fetchPublishedProviders(category?: ProviderCategory): Promise<Provider[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("providers")
    .select(PROVIDER_SELECT)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const providers = (data ?? []).map(mapProvider);
  return attachOfferings(providers);
}

export async function fetchProvider(id: string): Promise<Provider | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("providers").select(PROVIDER_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const [provider] = await attachOfferings([mapProvider(data)]);
  return provider ?? null;
}

/** Every provider profile the signed-in user owns, in any review state. */
export async function fetchOwnedProviders(ownerId: string): Promise<Provider[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("providers")
    .select(PROVIDER_SELECT)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return attachOfferings((data ?? []).map(mapProvider));
}

export async function createProviderProfile(
  ownerId: string,
  profile: NewProviderProfile,
): Promise<{ id?: string; error?: string }> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("providers")
    .insert({
      owner_id: ownerId,
      kind: profile.kind,
      category: profile.category,
      business_name: profile.businessName.trim(),
      tagline: profile.tagline.trim(),
      description: profile.description.trim(),
      service_area: profile.serviceArea.trim(),
      contact_email: profile.contactEmail.trim() || null,
      contact_phone: profile.contactPhone.trim() || null,
      starting_price: profile.startingPrice,
      price_unit: profile.priceUnit,
      images: profile.images,
      status: profile.submitForReview ? "pending_review" : "draft",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: String(data.id) };
}

export async function addProviderService(
  providerId: string,
  service: Pick<ProviderService, "name" | "description" | "startingPrice" | "priceUnit">,
): Promise<{ error?: string }> {
  const supabase = getSupabase();
  const { error } = await supabase.from("provider_services").insert({
    provider_id: providerId,
    name: service.name.trim(),
    description: service.description.trim(),
    starting_price: service.startingPrice,
    price_unit: service.priceUnit,
  });
  return error ? { error: error.message } : {};
}

/** A request alone reserves nothing — it opens a conversation with one provider. */
export async function createQuoteRequest(
  requesterId: string,
  request: NewQuoteRequest,
): Promise<{ id?: string; error?: string }> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("quote_requests")
    .insert({
      provider_id: request.providerId,
      requester_id: requesterId,
      listing_id: request.listingId ?? null,
      event_date: request.eventDate,
      event_location: request.eventLocation.trim(),
      start_time: request.startTime || null,
      hours: request.hours ?? null,
      guest_count: request.guestCount,
      notes: request.notes.trim(),
      needs_delivery: request.needsDelivery ?? false,
      needs_setup: request.needsSetup ?? false,
      needs_pickup: request.needsPickup ?? false,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const id = String(data.id);
  const items = request.items ?? [];
  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("quote_request_items").insert(
      items.map((item) => ({
        quote_request_id: id,
        rental_item_id: item.rentalItemId,
        quantity: item.quantity,
      })),
    );
    if (itemsError) return { id, error: itemsError.message };
  }

  return { id };
}

export async function fetchQuoteRequestsForRequester(requesterId: string): Promise<QuoteRequest[]> {
  return fetchQuoteRequests({ column: "requester_id", values: [requesterId] });
}

export async function fetchQuoteRequestsForProviders(providerIds: string[]): Promise<QuoteRequest[]> {
  if (providerIds.length === 0) return [];
  return fetchQuoteRequests({ column: "provider_id", values: providerIds });
}

export async function submitQuote(quote: NewQuote): Promise<{ error?: string }> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("submit_quote", {
    p_quote_request_id: quote.quoteRequestId,
    p_total_price: quote.totalPrice,
    p_deposit: quote.deposit,
    p_includes: quote.includes.trim(),
    p_cancellation_terms: quote.cancellationTerms.trim(),
    p_expires_at: quote.expiresAt ?? null,
  });
  return error ? { error: error.message } : {};
}

export async function setQuoteRequestStatus(
  quoteRequestId: string,
  status: Extract<QuoteRequestStatus, "accepted" | "confirmed" | "declined" | "closed">,
): Promise<{ error?: string }> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("set_quote_request_status", {
    p_quote_request_id: quoteRequestId,
    p_status: status,
  });
  return error ? { error: error.message } : {};
}

export async function fetchDirectorySpaces(category?: string): Promise<DirectorySpace[]> {
  const supabase = getSupabase();
  let query = supabase.from("directory_spaces").select(DIRECTORY_SELECT).order("name");
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    location: String(row.location),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    capacity: nullableNumber(row.capacity),
    amenities: stringArray(row.amenities),
    pricingNote: String(row.pricing_note ?? ""),
    restrictions: String(row.restrictions ?? ""),
    officialUrl: String(row.official_url),
    bookingContact: String(row.booking_contact ?? ""),
    lastCheckedAt: String(row.last_checked_at),
  }));
}

async function fetchQuoteRequests(filter: {
  column: "requester_id" | "provider_id";
  values: string[];
}): Promise<QuoteRequest[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("quote_requests")
    .select(QUOTE_REQUEST_SELECT)
    .in(filter.column, filter.values)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const requestIds = rows.map((row) => String(row.id));
  const providerIds = Array.from(new Set(rows.map((row) => String(row.provider_id))));

  const [providersResult, quotesResult, itemsResult] = await Promise.all([
    supabase.from("providers").select("id,business_name,category,images").in("id", providerIds),
    supabase.from("quotes").select(QUOTE_SELECT).in("quote_request_id", requestIds),
    supabase
      .from("quote_request_items")
      .select("id,quote_request_id,rental_item_id,quantity,rental_items(name,unit_price)")
      .in("quote_request_id", requestIds),
  ]);

  const providerById = new Map<string, Record<string, unknown>>();
  for (const row of providersResult.data ?? []) providerById.set(String(row.id), row);

  const quoteByRequest = new Map<string, Quote>();
  for (const row of quotesResult.data ?? []) {
    quoteByRequest.set(String(row.quote_request_id), mapQuote(row));
  }

  const itemsByRequest = new Map<string, QuoteRequestItem[]>();
  for (const row of (itemsResult.data ?? []) as Record<string, unknown>[]) {
    const key = String(row.quote_request_id);
    const rentalItem = relation(row.rental_items);
    const list = itemsByRequest.get(key) ?? [];
    list.push({
      id: String(row.id),
      rentalItemId: String(row.rental_item_id),
      name: String(rentalItem.name ?? "Equipment"),
      quantity: Number(row.quantity ?? 0),
      unitPrice: Number(rentalItem.unit_price ?? 0),
    });
    itemsByRequest.set(key, list);
  }

  return rows.map((row) => {
    const id = String(row.id);
    const provider = providerById.get(String(row.provider_id)) ?? {};
    const images = stringArray(provider.images);
    return {
      id,
      providerId: String(row.provider_id),
      providerName: String(provider.business_name ?? "Yardly provider"),
      providerCategory: (provider.category ?? "Photography") as ProviderCategory,
      providerImage: images[0] ?? FALLBACK_PROVIDER_IMAGE,
      requesterId: String(row.requester_id),
      // Profiles are readable only by their owner, so a provider sees the
      // request details rather than the planner's stored profile name.
      requesterName: "Yardly planner",
      listingId: row.listing_id ? String(row.listing_id) : null,
      eventDate: String(row.event_date),
      eventLocation: String(row.event_location),
      startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
      hours: nullableNumber(row.hours),
      guestCount: Number(row.guest_count ?? 0),
      notes: String(row.notes ?? ""),
      needsDelivery: Boolean(row.needs_delivery),
      needsSetup: Boolean(row.needs_setup),
      needsPickup: Boolean(row.needs_pickup),
      status: String(row.status) as QuoteRequestStatus,
      createdAt: String(row.created_at),
      items: itemsByRequest.get(id) ?? [],
      quote: quoteByRequest.get(id) ?? null,
    };
  });
}

async function attachOfferings(providers: Provider[]): Promise<Provider[]> {
  if (providers.length === 0) return providers;

  const supabase = getSupabase();
  const ids = providers.map((provider) => provider.id);

  const [servicesResult, rentalsResult] = await Promise.all([
    supabase.from("provider_services").select(PROVIDER_SERVICE_SELECT).in("provider_id", ids),
    supabase.from("rental_items").select(RENTAL_ITEM_SELECT).in("provider_id", ids),
  ]);

  const servicesByProvider = new Map<string, ProviderService[]>();
  for (const row of servicesResult.data ?? []) {
    const key = String(row.provider_id);
    const list = servicesByProvider.get(key) ?? [];
    list.push({
      id: String(row.id),
      providerId: key,
      name: String(row.name),
      description: String(row.description ?? ""),
      startingPrice: Number(row.starting_price ?? 0),
      priceUnit: String(row.price_unit ?? "event") as ProviderService["priceUnit"],
      sortOrder: Number(row.sort_order ?? 0),
    });
    servicesByProvider.set(key, list);
  }

  const rentalsByProvider = new Map<string, RentalItem[]>();
  for (const row of rentalsResult.data ?? []) {
    const key = String(row.provider_id);
    const list = rentalsByProvider.get(key) ?? [];
    list.push({
      id: String(row.id),
      providerId: key,
      name: String(row.name),
      description: String(row.description ?? ""),
      unitPrice: Number(row.unit_price ?? 0),
      availableQuantity: Number(row.available_quantity ?? 0),
      minQuantity: Number(row.min_quantity ?? 1),
      offersDelivery: Boolean(row.offers_delivery),
      offersSetup: Boolean(row.offers_setup),
      offersPickup: Boolean(row.offers_pickup),
    });
    rentalsByProvider.set(key, list);
  }

  return providers.map((provider) => ({
    ...provider,
    services: (servicesByProvider.get(provider.id) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    ),
    rentalItems: (rentalsByProvider.get(provider.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  }));
}

function mapProvider(row: Record<string, unknown>): Provider {
  const images = stringArray(row.images);
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    kind: String(row.kind) as ProviderKind,
    category: String(row.category) as ProviderCategory,
    businessName: String(row.business_name),
    tagline: String(row.tagline ?? ""),
    description: String(row.description ?? ""),
    serviceArea: String(row.service_area ?? ""),
    contactEmail: row.contact_email ? String(row.contact_email) : null,
    contactPhone: row.contact_phone ? String(row.contact_phone) : null,
    startingPrice: Number(row.starting_price ?? 0),
    priceUnit: String(row.price_unit ?? "event") as Provider["priceUnit"],
    images,
    image: images[0] ?? FALLBACK_PROVIDER_IMAGE,
    status: String(row.status) as ProviderStatus,
    reviewNotes: String(row.review_notes ?? ""),
    createdAt: String(row.created_at),
    services: [],
    rentalItems: [],
  };
}

function mapQuote(row: Record<string, unknown>): Quote {
  return {
    id: String(row.id),
    quoteRequestId: String(row.quote_request_id),
    totalPrice: Number(row.total_price ?? 0),
    deposit: Number(row.deposit ?? 0),
    includes: String(row.includes ?? ""),
    cancellationTerms: String(row.cancellation_terms ?? ""),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    createdAt: String(row.created_at),
  };
}

function relation(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return (value[0] ?? {}) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
