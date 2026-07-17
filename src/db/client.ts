import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "@/lib/config/env";
import * as schema from "./schema";

// Sole raw-connection point in the app — every other module reaches the
// database through the tenancy-scoped wrapper (PLAN.md §3.3), not this file.
const pool = mysql.createPool(env.DATABASE_URL);

export const db = drizzle(pool, { schema, mode: "default" });
