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
  title: string;
  location: string; // "City, ST"
  neighborhood: string;
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
  createdAt: string;
}

export interface User {
  name: string;
  email: string;
}
