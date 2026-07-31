import { env } from "@/lib/config/env";
import { localStorage } from "./local";
import { s3Storage } from "./s3";
import type { StorageAdapter } from "./types";

export type { StorageAdapter } from "./types";

function resolveStorage(): StorageAdapter {
  switch (env.STORAGE_DRIVER) {
    case "local":
      return localStorage;
    case "s3":
      return s3Storage;
  }
}

export const storage: StorageAdapter = resolveStorage();
