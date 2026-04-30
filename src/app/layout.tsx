import type { Metadata, Viewport } from "next";
import { Playfair_Display, Lora, Inter } from "next/font/google";
import { PlausibleAnalytics } from "@/components/PlausibleAnalytics";
import PlaybillBanner from "@/components/PlaybillBanner";
import HelpOverlay from "@/components/HelpOverlay";
import "./globals.css";

const playfair = Playfair_Display({
  weight: ["500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const lora = Lora({
  weight: ["400", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap",
});

const inter = Inter({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Plotline",
  description:
    "A blind collaborative storytelling party game for 4-12 players.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Plotline",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-itunes-app": "app-id=6763647982",
  },
  metadataBase: new URL(
    (() => {
      const url = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      return url.startsWith("http") ? url : `https://${url}`;
    })()
  ),
  openGraph: {
    title: "Plotline",
    description: "The Collaborative Storytelling Game",
    images: ["/og-image.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Plotline",
    description: "The Collaborative Storytelling Game",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
      className={`${playfair.variable} ${lora.variable} ${inter.variable}`}
    >
      <body className="antialiased">
        <PlaybillBanner />
        <main className="app-main">{children}</main>
        <HelpOverlay />
        <PlausibleAnalytics />
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker"in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js")})}`,
          }}
        />
      </body>
    </html>
  );
}
