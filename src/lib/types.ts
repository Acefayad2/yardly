export type Category =
  | "Trending"
  | "Beachfront"
  | "Cabins"
  | "Tiny homes"
  | "Amazing views"
  | "Design"
  | "Mansions"
  | "Lakefront"
  | "Countryside"
  | "City";

export interface Listing {
  id: string;
  title: string;
  location: string;
  country: string;
  category: Category;
  price: number; // per night, USD
  rating: number;
  reviews: number;
  beds: number;
  baths: number;
  guests: number;
  bedrooms: number;
  superhost: boolean;
  lat: number;
  lng: number;
  images: string[];
  host: { name: string; since: string; avatar: string };
  description: string;
  amenities: string[];
}

export interface Booking {
  id: string;
  listingId: string;
  title: string;
  image: string;
  location: string;
  checkIn: string; // ISO
  checkOut: string; // ISO
  guests: number;
  nights: number;
  total: number;
  createdAt: string;
}

export interface User {
  name: string;
  email: string;
}
