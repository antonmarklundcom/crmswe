import { ListSkeleton } from "@/components/list-skeleton";

export default function Loading() {
  return <ListSkeleton variant="cards" rows={4} />;
}
