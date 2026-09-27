import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://guildhall:guildhall@localhost:5432/guildhall";

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { guildhallSql?: postgres.Sql };
const client = globalForDb.guildhallSql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.guildhallSql = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };
