import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import Header from "@/components/Header";
import AuthModal from "@/components/AuthModal";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://yardly-app.netlify.app"),
  title: "Yardly — rent backyards, pools & outdoor spaces by the hour",
  description:
    "Find and book backyards, pools, outdoor kitchens, and unique outdoor spaces near you — by the hour or the day.",
  openGraph: {
    title: "Yardly — outdoor spaces by the hour",
    description: "Book private backyards, pools, gardens, and outdoor spaces for your next gathering.",
    type: "website",
    siteName: "Yardly",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <StoreProvider>
          <Header />
          <main id="main-content" className="flex-1">{children}</main>
          <Footer />
          <AuthModal />
          <BottomNav />
        </StoreProvider>
      </body>
    </html>
  );
}
