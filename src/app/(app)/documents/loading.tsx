import { ListSkeleton } from "@/components/list-skeleton";

export default function Loading() {
  return <ListSkeleton variant="rows" rows={6} />;
}
