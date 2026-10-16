import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DB1Database, DB2Database, DB3Database, DB4Database } from "./server-db.types";

export type ServerDbName = "db1" | "db2" | "db3" | "db4";

export type ServerDatabaseMap = {
  db1: DB1Database;
  db2: DB2Database;
  db3: DB3Database;
  db4: DB4Database;
};

type DbConfig = {
  urlKey: string;
  serviceKey: string;
};

const CONFIG: Record<ServerDbName, DbConfig> = {
  db1: { urlKey: "DB1_URL", serviceKey: "DB1_SERVICE_KEY" },
  db2: { urlKey: "DB2_URL", serviceKey: "DB2_SERVICE_KEY" },
  db3: { urlKey: "DB3_URL", serviceKey: "DB3_SERVICE_KEY" },
  db4: { urlKey: "DB4_URL", serviceKey: "DB4_SERVICE_KEY" },
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function makeClient<K extends ServerDbName>(name: K): SupabaseClient<ServerDatabaseMap[K]> {
  const cfg = CONFIG[name];
  const url = requireEnv(cfg.urlKey);
  const key = requireEnv(cfg.serviceKey);
  return createClient<ServerDatabaseMap[K]>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const cache = new Map<ServerDbName, unknown>();

export function getDb<K extends ServerDbName>(name: K): SupabaseClient<ServerDatabaseMap[K]> {
  const cached = cache.get(name);
  if (cached) return cached as SupabaseClient<ServerDatabaseMap[K]>;

  const client = makeClient(name);
  cache.set(name, client);
  return client;
}

export const db1Admin = new Proxy({} as SupabaseClient<DB1Database>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb("db1"), prop, receiver);
  },
});

export const db2Admin = new Proxy({} as SupabaseClient<DB2Database>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb("db2"), prop, receiver);
  },
});

export const db3Admin = new Proxy({} as SupabaseClient<DB3Database>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb("db3"), prop, receiver);
  },
});

export const db4Admin = new Proxy({} as SupabaseClient<DB4Database>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb("db4"), prop, receiver);
  },
});

export function supabaseServiceClient<K extends ServerDbName>(
  name: K,
): SupabaseClient<ServerDatabaseMap[K]> {
  return getDb(name);
}
