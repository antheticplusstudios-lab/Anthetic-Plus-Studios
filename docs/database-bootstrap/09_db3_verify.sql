DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector') THEN RAISE EXCEPTION 'DB3 vector extension is not installed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='kb_chunks') THEN RAISE EXCEPTION 'DB3 kb_chunks is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='kb_chunks_embedding_hnsw_idx') THEN RAISE EXCEPTION 'DB3 HNSW embedding index is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='match_kb_chunks') THEN RAISE EXCEPTION 'DB3 vector match RPC is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='insert_kb_chunk') THEN RAISE EXCEPTION 'DB3 chunk writer RPC is missing'; END IF;
END $$;
SELECT 'DB3 OK' AS verification, count(*) FILTER (WHERE relrowsecurity) AS rls_enabled_tables
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r';
