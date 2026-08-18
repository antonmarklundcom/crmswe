"use client";

import { ErrorState } from "@/components/error-state";

export default function GroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      namespace="errors.marketing"
      digest={error.digest}
      reset={reset} backHref="/"
    />
  );
}
