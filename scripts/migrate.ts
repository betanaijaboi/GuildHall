import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://guildhall:guildhall@localhost:5432/guildhall";
const client = postgres(url, { max: 1 });

await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
await client.end();
console.log("migrations applied");
