import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL environment variable");
}

const globalForPostgres = globalThis as typeof globalThis & {
  postgresPool?: Pool;
};

export const postgresPool =
  globalForPostgres.postgresPool ??
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPostgres.postgresPool = postgresPool;
}

export async function query<T extends import("pg").QueryResultRow = import("pg").QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  return postgresPool.query<T>(text, params);
}