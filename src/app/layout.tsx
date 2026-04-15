import type { Metadata, Viewport } from "next";
import { New_Rocker, Cormorant_Garamond, Outfit } from "next/font/google";
import { PlausibleAnalytics } from "@/components/PlausibleAnalytics";
import "./globals.css";

const newRocker = New_Rocker({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-new-rocker",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
});

const outfit = Outfit({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Plotline",
  description:
    "A blind collaborative storytelling party game for 4-12 players.",
  manifest: "/manifest.json",
  metadataBase: new URL(
    (() => {
      const url = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      return url.startsWith("http") ? url : `https://${url}`;
    })()
  ),
  openGraph: {
    title: "Plotline",
    description: "You can't make this up. Oh wait.",
    images: ["/og-image.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Plotline",
    description: "You can't make this up. Oh wait.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${newRocker.variable} ${cormorant.variable} ${outfit.variable}`}
    >
      <body className="bg-bg text-text font-sans antialiased">
        {children}
        <PlausibleAnalytics />
      </body>
    </html>
  );
}
