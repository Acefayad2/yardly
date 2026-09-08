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
  status: "pending" | "confirmed" | "completed" | "cancelled";
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export type HostListingStatus = "draft" | "published" | "paused";

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
  images: string[];
  image: string;
  status: HostListingStatus;
  createdAt: string;
}

export type HostReservationStatus = "upcoming" | "completed" | "cancelled";

export interface HostReservation {
  id: string;
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
  guestId: string;
  hostId: string;
  updatedAt: string;
  messages: ConversationMessage[];
}
