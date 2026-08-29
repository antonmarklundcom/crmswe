import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

// Installable home-screen app for the CRM (PLAN.md §13 H7). No service
// worker and no offline mode in this pass — this is the "add to home screen"
// half only, which is what makes the difference between a bookmark and
// something a rep opens like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: "CRM med offert och faktura för svenska småföretag",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f9fa",
    theme_color: "#182b4d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
