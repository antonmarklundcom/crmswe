import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { intlTag } from "@/lib/i18n/locales";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: siteConfig.name,
  description: "CRM med offert och faktura för svenska småföretag",
  // Installable on a phone's home screen (PLAN.md §13 H7). manifest.ts
  // describes the app; these are what iOS reads, which ignores the manifest
  // for the icon and the status bar.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: siteConfig.name, statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#182b4d",
  // The app is used one-handed on a phone; letting the browser chrome
  // resize with the keyboard is what keeps a reply box visible.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Follows the resolved locale (src/i18n/request.ts) rather than being
  // pinned to Spanish — screen readers and translation tooling both read it.
  //
  // The *full* tag (`sv-SE`, not `sv`), because `lang` is also what a browser
  // reads to decide how to draw a native `<input type="date">` and which day
  // its week starts on (plan.md §5.3.4). A bare `sv` leaves the region — and
  // therefore the date order — unstated. Firefox honours this; Chrome
  // currently prefers the browser's own locale regardless, so this is the
  // correct signal rather than a guarantee (see KNOWN-ISSUES O3-1).
  const locale = await getLocale();

  return (
    <html
      lang={intlTag(locale)}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
