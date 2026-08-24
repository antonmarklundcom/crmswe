import { cn } from "@/lib/utils";

// The mark from public/icon.svg, inline so it can sit next to the app name at
// text size without a network round-trip for 200 bytes. Signed-out screens
// are the only place the product has to introduce itself.
export function Wordmark({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 512 512"
        aria-hidden="true"
        className="size-7 rounded-[0.4rem]"
      >
        <rect width="512" height="512" rx="96" className="fill-foreground" />
        <path d="M144 160h56l56 152 56-152h56l-88 224h-48z" className="fill-background" />
      </svg>
      <span className="text-base font-semibold tracking-tight">{name}</span>
    </span>
  );
}
