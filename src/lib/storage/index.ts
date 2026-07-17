import { env } from "@/lib/config/env";
import { localStorage } from "./local";
import type { StorageAdapter } from "./types";

export type { StorageAdapter } from "./types";

function resolveStorage(): StorageAdapter {
  switch (env.STORAGE_DRIVER) {
    case "local":
      return localStorage;
    case "s3":
      throw new Error(
        "S3 storage driver not yet implemented — see PLAN.md §2.1",
      );
  }
}

export const storage: StorageAdapter = resolveStorage();
