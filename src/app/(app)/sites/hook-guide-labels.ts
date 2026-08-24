import { z } from "zod";
import type { HookGuidePlatform } from "./SiteHookGuide";

// The /sites page reads `app.sites.hookGuide.platforms` whole with t.raw()
// and hands it straight to a client component. That makes the message file a
// *contract*, and a broken contract used to take the whole page down: when
// the page addressed the array as `platforms.elementor.steps`, next-intl
// resolved nothing and returned the key path — a string — which the client
// component then called .map() on. TypeError, client-side, /sites blank
// (fixed in e08fbc4; reproduced from a real build before this change).
//
// t.raw() is unchecked by construction: its whole job is to hand back
// whatever is in the JSON. So the boundary is checked here instead. A
// platform that doesn't parse is dropped rather than passed on, because the
// worst honest outcome is one missing tab in a help panel — never a page
// that won't render.
const platformSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
});

export function hookGuidePlatforms(raw: unknown): HookGuidePlatform[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = platformSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}
