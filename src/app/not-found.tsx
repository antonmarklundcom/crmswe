import { NotFoundState } from "@/components/not-found-state";

// Root 404: what an unmatched URL lands on, outside every route group. It
// also gives the App Router a page to prerender for /404 instead of falling
// back to the pages-router error document.
export default function RootNotFound() {
  return <NotFoundState namespace="errors.notFound.marketing" backHref="/" />;
}
