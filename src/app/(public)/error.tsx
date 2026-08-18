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
      namespace="errors.public"
      digest={error.digest}
      reset={reset}
    />
  );
}
