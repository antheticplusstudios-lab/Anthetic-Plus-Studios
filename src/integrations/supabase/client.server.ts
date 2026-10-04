/**
 * Deprecated single-database compatibility export.
 * New server code must import db1Admin/db2Admin/db3Admin/db4Admin from
 * @/server/db/clients.server and choose the correct domain explicitly.
 */
export { db1Admin as supabaseAdmin } from "@/server/db/clients.server";
export { db1Admin, db2Admin, db3Admin, db4Admin, getDb, supabaseServiceClient } from "@/server/db/clients.server";
