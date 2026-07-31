import { env } from "@/lib/config/env";

// One place that knows the feed URL shape, shared by the settings page (which
// displays it) and the settings action (which returns it after rotation).
export function contactsFeedUrl(token: string): string {
  return `${env.APP_URL}/api/exports/contacts?token=${token}`;
}
