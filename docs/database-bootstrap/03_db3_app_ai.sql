-- AntheticPlus DB3: app_ai
-- AI configuration, RAG/knowledge, model provider pool, semantic cache and AI evaluation.
-- No browser/client database access: FastAPI uses the DB3 service key only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN CREATE TYPE public.kb_status AS ENUM ('active','processing','error','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.kb_source_type AS ENUM ('website_url','pdf_upload','manual_text','override_rule','api'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ingestion_status AS ENUM ('pending','processing','completed','failed','canceled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.provider_status AS ENUM ('active','degraded','disabled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.llm_request_status AS ENUM ('success','error','timeout','rate_limited','blocked'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.outbox_status AS ENUM ('pending','processing','processed','retryable','dead_letter'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END;
$$;

CREATE TABLE IF NOT EXISTS public.knowledge_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  automation_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Default Knowledge Base',
  status public.kb_status NOT NULL DEFAULT 'active',
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-small',
  embedding_dimensions integer NOT NULL DEFAULT 1536 CHECK (embedding_dimensions > 0),
  chunk_size integer NOT NULL DEFAULT 900 CHECK (chunk_size BETWEEN 100 AND 10000),
  chunk_overlap integer NOT NULL DEFAULT 120 CHECK (chunk_overlap >= 0 AND chunk_overlap < chunk_size),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kb_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id uuid NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  automation_id uuid NOT NULL,
  source_type public.kb_source_type NOT NULL,
  source_name text NOT NULL,
  canonical_url text,
  storage_path text,
  checksum text,
  content text NOT NULL DEFAULT '',
  priority integer NOT NULL DEFAULT 0,
  status public.ingestion_status NOT NULL DEFAULT 'completed',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kb_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.kb_documents(id) ON DELETE CASCADE,
  knowledge_base_id uuid NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  automation_id uuid NOT NULL,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content text NOT NULL,
  token_count integer,
  embedding vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS public.crawl_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  automation_id uuid NOT NULL,
  knowledge_base_id uuid REFERENCES public.knowledge_bases(id) ON DELETE SET NULL,
  job_type text NOT NULL DEFAULT 'crawl' CHECK (job_type IN ('crawl','ingest','embed','reindex')),
  target_url text,
  status public.ingestion_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_configs (
  automation_id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  primary_provider text NOT NULL DEFAULT 'openai',
  primary_model text NOT NULL DEFAULT 'gpt-5-mini',
  fallback_providers jsonb NOT NULL DEFAULT '[]'::jsonb,
  system_prompt text NOT NULL DEFAULT '',
  behavior_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  temperature numeric(4,3) NOT NULL DEFAULT 0.2 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens integer NOT NULL DEFAULT 1200 CHECK (max_tokens > 0),
  top_p numeric(4,3),
  retrieval_enabled boolean NOT NULL DEFAULT true,
  retrieval_top_k integer NOT NULL DEFAULT 8 CHECK (retrieval_top_k BETWEEN 1 AND 50),
  semantic_cache_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','disabled','error')),
  config_version integer NOT NULL DEFAULT 1,
  updated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL,
  client_id uuid NOT NULL,
  version integer NOT NULL,
  config jsonb NOT NULL,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, version)
);

CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid,
  client_id uuid,
  prompt_key text NOT NULL,
  version integer NOT NULL,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, prompt_key, version)
);

CREATE TABLE IF NOT EXISTS public.llm_providers (
  provider_key text PRIMARY KEY,
  display_name text NOT NULL,
  base_url text NOT NULL,
  status public.provider_status NOT NULL DEFAULT 'active',
  priority integer NOT NULL DEFAULT 100,
  default_model text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.llm_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL REFERENCES public.llm_providers(provider_key) ON DELETE RESTRICT,
  label text NOT NULL DEFAULT '',
  key_hint text NOT NULL DEFAULT '',
  key_ciphertext text NOT NULL,
  encryption_key_version integer NOT NULL DEFAULT 1,
  model text,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  cooldown_until timestamptz,
  error_count integer NOT NULL DEFAULT 0,
  request_count bigint NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.llm_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  automation_id uuid,
  provider_key text NOT NULL,
  model text NOT NULL,
  key_id uuid REFERENCES public.llm_api_keys(id) ON DELETE SET NULL,
  status public.llm_request_status NOT NULL,
  http_status integer,
  latency_ms integer,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  error text,
  trace_id text,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.semantic_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  automation_id uuid NOT NULL,
  prompt_hash text NOT NULL,
  query_embedding vector(1536),
  normalized_query text NOT NULL,
  response_payload jsonb NOT NULL,
  provider_key text,
  model text,
  expires_at timestamptz,
  hit_count bigint NOT NULL DEFAULT 0,
  last_hit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, prompt_hash)
);

CREATE TABLE IF NOT EXISTS public.ai_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  automation_id uuid,
  conversation_id uuid,
  transcript text NOT NULL,
  tone_score integer NOT NULL DEFAULT 0 CHECK (tone_score BETWEEN 0 AND 100),
  accuracy_score integer NOT NULL DEFAULT 0 CHECK (accuracy_score BETWEEN 0 AND 100),
  helpfulness_score integer NOT NULL DEFAULT 0 CHECK (helpfulness_score BETWEEN 0 AND 100),
  overall_score integer NOT NULL DEFAULT 0 CHECK (overall_score BETWEEN 0 AND 100),
  summary text NOT NULL DEFAULT '',
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvements jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status public.outbox_status NOT NULL DEFAULT 'pending',
  locked_by text,
  locked_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.processed_events (
  event_id uuid PRIMARY KEY,
  event_type text NOT NULL,
  payload_hash text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_bases_automation_idx ON public.knowledge_bases(automation_id, status);
CREATE INDEX IF NOT EXISTS kb_documents_automation_idx ON public.kb_documents(automation_id, priority DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS kb_chunks_automation_idx ON public.kb_chunks(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_hnsw_idx ON public.kb_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS crawl_jobs_queue_idx ON public.crawl_jobs(status, next_attempt_at, created_at)
  WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS llm_api_keys_pool_idx ON public.llm_api_keys(provider_key, is_active, priority, cooldown_until);
CREATE INDEX IF NOT EXISTS llm_requests_automation_idx ON public.llm_requests(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS semantic_cache_embedding_hnsw_idx ON public.semantic_cache USING hnsw (query_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS outbox_queue_idx ON public.outbox_events(status, next_attempt_at, created_at)
  WHERE status IN ('pending','retryable','processing');

DROP TRIGGER IF EXISTS knowledge_bases_touch ON public.knowledge_bases;
CREATE TRIGGER knowledge_bases_touch BEFORE UPDATE ON public.knowledge_bases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS kb_documents_touch ON public.kb_documents;
CREATE TRIGGER kb_documents_touch BEFORE UPDATE ON public.kb_documents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS ai_configs_touch ON public.ai_configs;
CREATE TRIGGER ai_configs_touch BEFORE UPDATE ON public.ai_configs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS llm_providers_touch ON public.llm_providers;
CREATE TRIGGER llm_providers_touch BEFORE UPDATE ON public.llm_providers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS llm_api_keys_touch ON public.llm_api_keys;
CREATE TRIGGER llm_api_keys_touch BEFORE UPDATE ON public.llm_api_keys FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_outbox(p_event_type text,p_aggregate_type text,p_aggregate_id uuid,p_idempotency_key text,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.outbox_events(event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(p_event_type,p_aggregate_type,p_aggregate_id,p_idempotency_key,COALESCE(p_payload,'{}'::jsonb))
  ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_outbox_events(p_worker_id text,p_batch_size integer)
RETURNS SETOF public.outbox_events LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.outbox_events
    WHERE status='pending'
       OR (status='retryable' AND next_attempt_at<=now())
       OR (status='processing' AND locked_at<now()-interval '5 minutes')
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT GREATEST(1,p_batch_size)
  )
  UPDATE public.outbox_events e
  SET status='processing',locked_by=p_worker_id,locked_at=now(),attempt_count=e.attempt_count+1
  FROM picked WHERE e.id=picked.id RETURNING e.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_outbox_event(p_event_id uuid,p_worker_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.outbox_events SET status='processed',processed_at=now(),locked_by=NULL,locked_at=NULL,last_error=NULL
  WHERE id=p_event_id AND (locked_by=p_worker_id OR locked_by IS NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_outbox_event(p_event_id uuid,p_worker_id text,p_error text,p_retry_at timestamptz,p_dead_letter boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.outbox_events
  SET status=CASE WHEN p_dead_letter THEN 'dead_letter' ELSE 'retryable' END,
      last_error=left(COALESCE(p_error,''),4000),next_attempt_at=COALESCE(p_retry_at,now()+interval '5 minutes'),locked_by=NULL,locked_at=NULL
  WHERE id=p_event_id AND (locked_by=p_worker_id OR locked_by IS NULL);
END;
$$;

-- Optional private bucket for knowledge-file storage. FastAPI should issue signed URLs;
-- the bucket is deliberately not public and there are no direct authenticated storage policies here.
INSERT INTO storage.buckets(id,name,public)
VALUES ('kb-uploads','kb-uploads',false)
ON CONFLICT (id) DO UPDATE SET public=false;

ALTER TABLE public.knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semantic_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

REVOKE EXECUTE ON FUNCTION public.enqueue_outbox(text,text,uuid,text,jsonb), public.claim_outbox_events(text,integer), public.complete_outbox_event(uuid,text), public.fail_outbox_event(uuid,text,text,timestamptz,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_outbox(text,text,uuid,text,jsonb), public.claim_outbox_events(text,integer), public.complete_outbox_event(uuid,text), public.fail_outbox_event(uuid,text,text,timestamptz,boolean) TO service_role;

INSERT INTO public.llm_providers(provider_key,display_name,base_url,status,priority,default_model)
VALUES
 ('openai','OpenAI','https://api.openai.com/v1','active',10,'gpt-5-mini'),
 ('anthropic','Anthropic','https://api.anthropic.com/v1','active',20,'claude-sonnet'),
 ('openrouter','OpenRouter','https://openrouter.ai/api/v1','active',30,'openai/gpt-5-mini'),
 ('groq','Groq','https://api.groq.com/openai/v1','active',40,'llama-3.3-70b-versatile')
ON CONFLICT (provider_key) DO NOTHING;


-- Vector similarity RPC used by the runtime.
CREATE OR REPLACE FUNCTION public.match_kb_chunks(
  p_automation_id uuid, p_embedding vector(1536), p_match_count integer DEFAULT 8, p_min_similarity double precision DEFAULT 0.25
)
RETURNS TABLE(chunk_id uuid, document_id uuid, content text, source_name text, similarity double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
  SELECT c.id, c.document_id, c.content, d.source_name,
         (1 - (c.embedding <=> p_embedding))::double precision AS similarity
  FROM public.kb_chunks c
  JOIN public.kb_documents d ON d.id=c.document_id
  WHERE c.automation_id=p_automation_id
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> p_embedding)) >= p_min_similarity
  ORDER BY c.embedding <=> p_embedding
  LIMIT GREATEST(1, LEAST(p_match_count,50));
$$;
REVOKE EXECUTE ON FUNCTION public.match_kb_chunks(uuid,vector,integer,double precision) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.match_kb_chunks(uuid,vector,integer,double precision) TO service_role;


-- Idempotent chunk writer used by the server-side RAG ingestion pipeline.
CREATE OR REPLACE FUNCTION public.insert_kb_chunk(
  p_document_id uuid,
  p_knowledge_base_id uuid,
  p_client_id uuid,
  p_automation_id uuid,
  p_chunk_index integer,
  p_content text,
  p_token_count integer,
  p_embedding vector(1536),
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.kb_chunks(document_id,knowledge_base_id,client_id,automation_id,chunk_index,content,token_count,embedding,metadata)
  VALUES(p_document_id,p_knowledge_base_id,p_client_id,p_automation_id,p_chunk_index,p_content,p_token_count,p_embedding,COALESCE(p_metadata,'{}'::jsonb))
  ON CONFLICT(document_id,chunk_index) DO UPDATE SET
    content=EXCLUDED.content, token_count=EXCLUDED.token_count, embedding=EXCLUDED.embedding, metadata=EXCLUDED.metadata;
  SELECT id INTO v_id FROM public.kb_chunks WHERE document_id=p_document_id AND chunk_index=p_chunk_index;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.insert_kb_chunk(uuid,uuid,uuid,uuid,integer,text,integer,vector,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.insert_kb_chunk(uuid,uuid,uuid,uuid,integer,text,integer,vector,jsonb) TO service_role;
