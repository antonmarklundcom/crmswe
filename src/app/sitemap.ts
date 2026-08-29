import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

// The marketing site is four pages and they are all static, so the sitemap
// is a literal list rather than a crawl (PLAN.md §13 H7). App routes are
// deliberately absent: they are behind a login.
const PAGES = ["", "/sa-funkar-det", "/om-oss", "/kontakt"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly" as const,
    priority: path === "" ? 1 : 0.8,
  }));
}
