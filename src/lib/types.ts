export type SpaceType =
  | "Backyards"
  | "Pools"
  | "Outdoor kitchens"
  | "Patios & decks"
  | "Gardens"
  | "Fire pits"
  | "Rooftops"
  | "Sport courts"
  | "Event yards"
  | "Hot tubs";

export interface Space {
  id: string;
  hostId: string;
  isDemo?: boolean;
  title: string;
  location: string; // "City, ST"
  neighborhood: string;
  timezone: string;
  spaceType: SpaceType;
  hourlyPrice: number; // USD per hour
  dayPrice: number; // USD flat full-day rate
  minHours: number;
  rating: number;
  reviews: number;
  capacity: number; // max guests
  acres: number; // yard size in acres
  topHost: boolean;
  lat: number;
  lng: number;
  images: string[];
  host: { name: string; since: string; avatar: string; responseRate: number };
  description: string;
  amenities: string[];
  rules: string[];
}

export interface Booking {
  id: string;
  spaceId: string;
  title: string;
  image: string;
  location: string;
  date: string; // ISO date (yyyy-MM-dd)
  startTime: string; // "14:00"
  endTime: string; // "18:00"
  hours: number;
  fullDay: boolean;
  guests: number;
  total: number;
  status: "confirmed" | "completed" | "cancelled";
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

// Hosting capability, not a permission. Listing access is always ownership-based
// (listings.host_id = auth.uid()) in RLS; nothing in the database reads this.
export type AccountType = "guest" | "host" | "both";

// Which side of the marketplace the user is currently looking at.
export type AppMode = "traveling" | "hosting";

export type HostListingStatus = "draft" | "published" | "paused" | "archived";

// The final, host-ordered sequence of a listing's photos. "existing" entries are
// already-uploaded URLs; "new" entries are local files still to be uploaded. Walking
// this in order (rather than always keeping every existing image and appending new
// ones after) is what lets a host reorder photos -- including making a newly added one
// the cover photo -- before saving.
export type ListingImagePlanEntry = { kind: "existing"; url: string } | { kind: "new"; file: File };

export interface HostListing {
  id: string;
  title: string;
  location: string;
  neighborhood: string;
  timezone: string;
  spaceType: SpaceType;
  hourlyPrice: number;
  minHours: number;
  capacity: number;
  description: string;
  amenities: string[];
  rules: string[];
  latitude: number | null;
  longitude: number | null;
  streetAddress: string | null; // private; never included in the public marketplace feed
  images: string[];
  image: string;
  status: HostListingStatus;
  createdAt: string;
}

export type HostReservationStatus = "upcoming" | "completed" | "cancelled";

export interface HostReservation {
  id: string;
  guestId: string;
  listingId: string;
  listingTitle: string;
  guestName: string;
  date: string;
  startTime: string;
  endTime: string;
  guests: number;
  payout: number;
  status: HostReservationStatus;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImage: string;
  listingAvailable: boolean;
  guestId: string;
  hostId: string;
  updatedAt: string;
  messages: ConversationMessage[];
}

export type ProviderKind = "service" | "rental";

export type ProviderCategory =
  | "Photography"
  | "Videography"
  | "Catering"
  | "Music & DJ"
  | "Event staffing"
  | "Decor & florals"
  | "Event equipment";

export type ProviderStatus = "draft" | "pending_review" | "published" | "rejected" | "paused";

export type PriceUnit = "hour" | "event" | "day" | "item";

export interface ProviderService {
  id: string;
  providerId: string;
  name: string;
  description: string;
  startingPrice: number;
  priceUnit: Exclude<PriceUnit, "item">;
  sortOrder: number;
}

export interface RentalItem {
  id: string;
  providerId: string;
  name: string;
  description: string;
  unitPrice: number;
  availableQuantity: number;
  minQuantity: number;
  offersDelivery: boolean;
  offersSetup: boolean;
  offersPickup: boolean;
}

export interface Provider {
  id: string;
  ownerId: string;
  kind: ProviderKind;
  category: ProviderCategory;
  businessName: string;
  tagline: string;
  description: string;
  serviceArea: string;
  contactEmail: string | null;
  contactPhone: string | null;
  startingPrice: number;
  priceUnit: PriceUnit;
  images: string[];
  image: string;
  status: ProviderStatus;
  reviewNotes: string;
  createdAt: string;
  services: ProviderService[];
  rentalItems: RentalItem[];
}

export type QuoteRequestStatus =
  | "awaiting_reply"
  | "quoted"
  | "accepted"
  | "confirmed"
  | "declined"
  | "closed";

export interface Quote {
  id: string;
  quoteRequestId: string;
  totalPrice: number;
  deposit: number;
  includes: string;
  cancellationTerms: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface QuoteRequestItem {
  id: string;
  rentalItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface QuoteRequest {
  id: string;
  providerId: string;
  providerName: string;
  providerCategory: ProviderCategory;
  providerImage: string;
  requesterId: string;
  requesterName: string;
  listingId: string | null;
  eventDate: string;
  eventLocation: string;
  startTime: string | null;
  hours: number | null;
  guestCount: number;
  notes: string;
  needsDelivery: boolean;
  needsSetup: boolean;
  needsPickup: boolean;
  status: QuoteRequestStatus;
  createdAt: string;
  items: QuoteRequestItem[];
  quote: Quote | null;
}

export interface DirectorySpace {
  id: string;
  name: string;
  category: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  amenities: string[];
  pricingNote: string;
  restrictions: string;
  officialUrl: string;
  bookingContact: string;
  lastCheckedAt: string;
}
