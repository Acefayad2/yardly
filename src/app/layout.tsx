import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import Header from "@/components/Header";
import AuthModal from "@/components/AuthModal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "stayscape — book unique places to stay",
  description:
    "Find and book cabins, beachfront villas, and one-of-a-kind homes around the world.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <StoreProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <AuthModal />
        </StoreProvider>
      </body>
    </html>
  );
}
