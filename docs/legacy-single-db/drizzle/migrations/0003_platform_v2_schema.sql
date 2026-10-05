CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS registered_origin_domain text NOT NULL DEFAULT 'antheticplus.com';
UPDATE public.profiles SET client_id = 'CL-' || upper(substr(md5(id::text),1,8)) WHERE client_id IS NULL;
ALTER TABLE public.profiles ALTER COLUMN client_id SET DEFAULT ('CL-' || upper(substr(md5(gen_random_uuid()::text),1,8)));
ALTER TABLE public.profiles ALTER COLUMN client_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_client_id_key ON public.profiles(client_id);

CREATE OR REPLACE FUNCTION public.my_client_id() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT client_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.my_origin_domain() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT registered_origin_domain FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;

CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_name text NOT NULL,
  instructions text NOT NULL,
  required_fields jsonb NOT NULL DEFAULT '["sender_phone","trx_id"]'::jsonb,
  is_card boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_methods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY pm_read ON public.payment_methods FOR SELECT TO anon, authenticated USING (is_active OR public.is_admin(auth.uid()));
CREATE POLICY pm_write ON public.payment_methods FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text UNIQUE NOT NULL DEFAULT ('ORD-' || upper(substr(md5(gen_random_uuid()::text),1,8))),
  client_id text NOT NULL REFERENCES public.profiles(client_id) ON DELETE CASCADE ON UPDATE CASCADE,
  automation_type text NOT NULL CHECK (automation_type IN ('ai_receptionist','messaging_ai','web_chatbot','workflow_automation')),
  delivery_channel text NOT NULL DEFAULT 'web',
  selected_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  full_name text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  target_domain_url text NOT NULL,
  total_amount numeric(10,2) NOT NULL,
  payment_method_id uuid REFERENCES public.payment_methods(id),
  payment_proof_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  origin_domain text NOT NULL DEFAULT 'antheticplus.com',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_own_read ON public.orders FOR SELECT TO authenticated USING (client_id = public.my_client_id());
CREATE POLICY orders_staff_read ON public.orders FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'verifier')
  OR (public.has_role(auth.uid(),'partner') AND origin_domain = public.my_origin_domain()));
CREATE POLICY orders_own_insert ON public.orders FOR INSERT TO authenticated WITH CHECK (client_id = public.my_client_id() AND status = 'pending_verification');

CREATE TABLE public.client_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.profiles(client_id) ON DELETE CASCADE ON UPDATE CASCADE,
  order_id text REFERENCES public.orders(order_id) ON DELETE CASCADE,
  automation_type text NOT NULL,
  domain_url text NOT NULL DEFAULT '',
  webhook_url text NOT NULL DEFAULT '',
  script_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  assigned_phone_number text,
  requires_reinstallation boolean NOT NULL DEFAULT false,
  hmac_key text NOT NULL DEFAULT gen_random_uuid()::text,
  widget_config jsonb NOT NULL DEFAULT '{"orb_color_primary":"#6366f1","orb_color_secondary":"#a855f7","orb_color_accent":"#22d3ee","animation_speed":1,"waveform_amplitude":0.6,"position":"bottom-right","enable_waveforms":true,"greeting_text":"Hello! How can I assist you today?","font_style":"sans"}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  origin_domain text NOT NULL DEFAULT 'antheticplus.com',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.client_automations TO authenticated;
GRANT ALL ON public.client_automations TO service_role;
ALTER TABLE public.client_automations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owns_client_automation(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.client_automations WHERE id=_id AND client_id = public.my_client_id()) $$;
CREATE OR REPLACE FUNCTION public.can_manage_client_automation(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(auth.uid(),'owner') OR EXISTS (
    SELECT 1 FROM public.client_automations WHERE id=_id AND public.has_role(auth.uid(),'partner') AND origin_domain = public.my_origin_domain()) $$;

CREATE POLICY ca_read ON public.client_automations FOR SELECT TO authenticated USING (client_id = public.my_client_id() OR public.can_manage_client_automation(id));
CREATE POLICY ca_update ON public.client_automations FOR UPDATE TO authenticated USING (client_id = public.my_client_id() OR public.can_manage_client_automation(id)) WITH CHECK (client_id = public.my_client_id() OR public.can_manage_client_automation(id));

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid REFERENCES public.client_automations(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  changed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY al_read ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR (automation_id IS NOT NULL AND public.owns_client_automation(automation_id)));

CREATE TABLE public.crawl_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE CASCADE,
  target_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.crawl_jobs TO authenticated;
GRANT ALL ON public.crawl_jobs TO service_role;
ALTER TABLE public.crawl_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY cj_read ON public.crawl_jobs FOR SELECT TO authenticated USING (public.owns_client_automation(automation_id) OR public.can_manage_client_automation(automation_id));
CREATE POLICY cj_insert ON public.crawl_jobs FOR INSERT TO authenticated WITH CHECK ((public.owns_client_automation(automation_id) OR public.can_manage_client_automation(automation_id)) AND status='pending');

CREATE OR REPLACE FUNCTION public.ca_guard_columns() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    IF NEW.script_token IS DISTINCT FROM OLD.script_token OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.assigned_phone_number IS DISTINCT FROM OLD.assigned_phone_number
       OR NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.automation_type IS DISTINCT FROM OLD.automation_type
       OR NEW.hmac_key IS DISTINCT FROM OLD.hmac_key OR NEW.origin_domain IS DISTINCT FROM OLD.origin_domain THEN
      RAISE EXCEPTION 'You cannot change these automation settings';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ca_guard BEFORE UPDATE ON public.client_automations FOR EACH ROW EXECUTE FUNCTION public.ca_guard_columns();

CREATE OR REPLACE FUNCTION public.ca_rotate_on_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _changed jsonb := '{}'::jsonb;
BEGIN
  IF NEW.domain_url IS DISTINCT FROM OLD.domain_url THEN _changed := _changed || jsonb_build_object('domain_url', jsonb_build_array(OLD.domain_url, NEW.domain_url)); END IF;
  IF NEW.webhook_url IS DISTINCT FROM OLD.webhook_url THEN _changed := _changed || jsonb_build_object('webhook_url', jsonb_build_array(OLD.webhook_url, NEW.webhook_url)); END IF;
  IF NEW.hmac_key IS DISTINCT FROM OLD.hmac_key THEN _changed := _changed || jsonb_build_object('hmac_key', 'rotated'); END IF;
  IF _changed <> '{}'::jsonb THEN
    NEW.script_token := encode(gen_random_bytes(16),'hex');
    NEW.requires_reinstallation := true;
    INSERT INTO public.crawl_jobs (automation_id, target_url) VALUES (NEW.id, COALESCE(NULLIF(NEW.domain_url,''), OLD.domain_url));
    INSERT INTO public.audit_logs (automation_id, event_type, changed_fields, actor) VALUES (NEW.id, 'script.rotated', _changed, auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ca_rotate BEFORE UPDATE ON public.client_automations FOR EACH ROW EXECUTE FUNCTION public.ca_rotate_on_change();

CREATE TABLE public.automation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (automation_id, task_key)
);
GRANT SELECT, INSERT, UPDATE ON public.automation_tasks TO authenticated;
GRANT ALL ON public.automation_tasks TO service_role;
ALTER TABLE public.automation_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY at_all ON public.automation_tasks FOR ALL TO authenticated USING (public.owns_client_automation(automation_id) OR public.can_manage_client_automation(automation_id)) WITH CHECK (public.owns_client_automation(automation_id) OR public.can_manage_client_automation(automation_id));

CREATE TABLE public.llm_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('openrouter','groq')),
  label text NOT NULL DEFAULT '',
  api_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  cooldown_until timestamptz,
  error_count int NOT NULL DEFAULT 0,
  request_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.llm_api_keys TO authenticated;
GRANT ALL ON public.llm_api_keys TO service_role;
ALTER TABLE public.llm_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY lk_owner ON public.llm_api_keys FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

CREATE TABLE public.usage_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE CASCADE,
  billing_period text NOT NULL,
  call_minutes_used int NOT NULL DEFAULT 0,
  sms_count_used int NOT NULL DEFAULT 0,
  tokens_used bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, billing_period)
);
GRANT SELECT ON public.usage_meters TO authenticated;
GRANT ALL ON public.usage_meters TO service_role;
ALTER TABLE public.usage_meters ENABLE ROW LEVEL SECURITY;
CREATE POLICY um_read ON public.usage_meters FOR SELECT TO authenticated USING (public.owns_client_automation(automation_id) OR public.can_manage_client_automation(automation_id));

CREATE TABLE public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  status text NOT NULL DEFAULT 'connected',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.integration_connections TO service_role;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.integration_status(_automation_id uuid) RETURNS TABLE(provider text, status text, updated_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT provider, status, updated_at FROM public.integration_connections
  WHERE automation_id=_automation_id AND (public.owns_client_automation(_automation_id) OR public.can_manage_client_automation(_automation_id)) $$;
GRANT EXECUTE ON FUNCTION public.integration_status(uuid) TO authenticated;

CREATE TABLE public.kb_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('website_url','pdf_upload','manual_text','override_rule')),
  source_name text NOT NULL,
  content text NOT NULL DEFAULT '',
  storage_path text,
  priority int NOT NULL DEFAULT 0,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.kb_documents TO authenticated;
GRANT ALL ON public.kb_documents TO service_role;
ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY kb_read ON public.kb_documents FOR SELECT TO authenticated USING (public.owns_client_automation(automation_id) OR public.can_manage_client_automation(automation_id));
CREATE POLICY kb_insert ON public.kb_documents FOR INSERT TO authenticated WITH CHECK (public.can_manage_client_automation(automation_id) OR (public.owns_client_automation(automation_id) AND source_type <> 'override_rule'));
CREATE POLICY kb_delete ON public.kb_documents FOR DELETE TO authenticated USING (public.can_manage_client_automation(automation_id) OR (public.owns_client_automation(automation_id) AND source_type <> 'override_rule'));

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('web_chat','phone_call','whatsapp','messenger','telegram','sms')),
  customer_phone_or_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','handed_off_to_human','failed')),
  audio_recording_url text,
  extracted_lead_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY cv_read ON public.conversations FOR SELECT TO authenticated USING (public.owns_client_automation(automation_id) OR public.can_manage_client_automation(automation_id) OR public.is_staff(auth.uid()));

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  tokens_used int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY msg_read ON public.messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id));

CREATE TABLE public.conversation_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  transcript text NOT NULL,
  what_went_wrong text NOT NULL,
  recommended_fix text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.conversation_diagnostics TO authenticated;
GRANT ALL ON public.conversation_diagnostics TO service_role;
ALTER TABLE public.conversation_diagnostics ENABLE ROW LEVEL SECURITY;
CREATE POLICY cd_read ON public.conversation_diagnostics FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY cd_insert ON public.conversation_diagnostics FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.review_order(_order_id uuid, _approve boolean, _reason text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _o record; _aid uuid; _tok text; _feat text;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id=_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF NOT (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'verifier')
     OR (public.has_role(auth.uid(),'partner') AND _o.origin_domain = public.my_origin_domain())) THEN
    RAISE EXCEPTION 'not authorized'; END IF;
  IF _o.status <> 'pending_verification' THEN RAISE EXCEPTION 'order already reviewed'; END IF;
  IF NOT _approve AND COALESCE(trim(_reason),'')='' THEN RAISE EXCEPTION 'a reason is required to reject'; END IF;
  UPDATE public.orders SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    rejection_reason = CASE WHEN _approve THEN NULL ELSE _reason END, reviewed_by=auth.uid(), reviewed_at=now() WHERE id=_order_id;
  IF _approve THEN
    INSERT INTO public.client_automations (client_id, order_id, automation_type, domain_url, origin_domain)
    VALUES (_o.client_id, _o.order_id, _o.automation_type, _o.target_domain_url, _o.origin_domain) RETURNING id, script_token INTO _aid, _tok;
    FOR _feat IN SELECT jsonb_array_elements_text(_o.selected_features) LOOP
      INSERT INTO public.automation_tasks (automation_id, task_key, enabled) VALUES (_aid, _feat, true) ON CONFLICT DO NOTHING;
    END LOOP;
    INSERT INTO public.crawl_jobs (automation_id, target_url) VALUES (_aid, _o.target_domain_url);
  END IF;
  INSERT INTO public.audit_logs (automation_id, event_type, changed_fields, actor)
  VALUES (_aid, CASE WHEN _approve THEN 'order.approved' ELSE 'order.rejected' END, jsonb_build_object('order_id', _o.order_id, 'reason', _reason), auth.uid());
  RETURN _tok;
END $$;
REVOKE EXECUTE ON FUNCTION public.review_order(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_order(uuid, boolean, text) TO authenticated;

CREATE POLICY kb_up_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='kb-uploads' AND ((storage.foldername(name))[1] = public.my_client_id() OR public.is_admin(auth.uid())));
CREATE POLICY kb_up_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='kb-uploads' AND ((storage.foldername(name))[1] = public.my_client_id() OR public.is_admin(auth.uid())));
CREATE POLICY kb_up_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='kb-uploads' AND ((storage.foldername(name))[1] = public.my_client_id() OR public.is_admin(auth.uid())));

COMMENT ON TABLE public.automation_instances IS 'DEPRECATED: replaced by client_automations';
COMMENT ON TABLE public.payment_submissions IS 'DEPRECATED: replaced by orders';
COMMENT ON TABLE public.groq_keys IS 'DEPRECATED: replaced by llm_api_keys';
COMMENT ON TABLE public.transcripts IS 'DEPRECATED: replaced by conversations/messages';