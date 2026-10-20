import type { Metadata } from "next";
import BookingAssistance from "@/components/BookingAssistance";
export const metadata: Metadata = { title: "Booking help — Yardly", description: "Human-reviewed venue suggestions and application drafts with customer approval." };
export default function BookingHelpPage(){return <BookingAssistance/>}
