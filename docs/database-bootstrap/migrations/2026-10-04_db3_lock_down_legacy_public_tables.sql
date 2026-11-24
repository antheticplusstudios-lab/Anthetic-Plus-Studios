-- Applied live 2026-10-04. Server-side service_role access remains available.
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_requests, public.ai_usage, public.ai_messages, public.ai_outbox FROM anon, authenticated;
