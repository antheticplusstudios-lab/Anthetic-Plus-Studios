import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ServerDbName = "db1" | "db2" | "db3" | "db4";

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

function makeClient(name: ServerDbName) {
  const cfg = CONFIG[name];
  const url = requireEnv(cfg.urlKey);
  const key = requireEnv(cfg.serviceKey);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const cache = new Map<ServerDbName, SupabaseClient<any>>();

export function getDb(name: ServerDbName): SupabaseClient<any> {
  let client = cache.get(name);
  if (!client) {
    client = makeClient(name);
    cache.set(name, client);
  }
  return client;
}

export const db1Admin = new Proxy({} as SupabaseClient<any>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb("db1"), prop, receiver);
  },
});

export const db2Admin = new Proxy({} as SupabaseClient<any>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb("db2"), prop, receiver);
  },
});

export const db3Admin = new Proxy({} as SupabaseClient<any>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb("db3"), prop, receiver);
  },
});

export const db4Admin = new Proxy({} as SupabaseClient<any>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb("db4"), prop, receiver);
  },
});

export function supabaseServiceClient(name: ServerDbName) {
  return getDb(name);
}
