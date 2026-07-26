import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // The DB-backed suites all point at one MySQL and share global tables
    // (jobs above all), so files must not run concurrently — a parallel run
    // has them claiming each other's rows.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
