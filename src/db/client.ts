import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "@/lib/config/env";
import * as schema from "./schema";
import { forceIpv4Loopback } from "./url";

// Sole raw-connection point in the app — every other module reaches the
// database through the tenancy-scoped wrapper (PLAN.md §3.3), not this file.

export const pool = mysql.createPool(forceIpv4Loopback(env.DATABASE_URL));

export const db = drizzle(pool, { schema, mode: "default" });
