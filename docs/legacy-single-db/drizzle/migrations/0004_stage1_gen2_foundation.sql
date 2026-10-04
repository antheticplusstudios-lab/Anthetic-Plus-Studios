-- Server-side pricing
CREATE TABLE public.product_prices (
  product text NOT NULL,
  option_key text NOT NULL,
  price numeric NOT NULL CHECK (price >= 0),
  kind text NOT NULL DEFAULT 'channel',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product, option_key)
);
GRANT SELECT ON public.product_prices TO anon, authenticated;
GRANT ALL ON public.product_prices TO service_role;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY pp_read ON public.product_prices FOR SELECT USING (true);
CREATE POLICY pp_owner ON public.product_prices FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));
INSERT INTO public.product_prices (product, option_key, price, kind) VALUES
 ('ai_receptionist','web',99,'channel'),('ai_receptionist','phone',148,'channel'),('ai_receptionist','hybrid',178,'channel'),
 ('messaging_ai','base',79,'base'),('messaging_ai','extra_channel',20,'addon');

CREATE OR REPLACE FUNCTION public.place_order(_product text, _channel text, _msg_channels text[], _features jsonb,
  _full_name text, _company text, _email text, _country text, _target text, _method uuid, _proof jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid text; _origin text; _total numeric; _oid text; _base numeric; _extra numeric;
BEGIN
  SELECT client_id, registered_origin_domain INTO _cid, _origin FROM public.profiles WHERE user_id = auth.uid();
  IF _cid IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id=_method AND is_active AND NOT is_card) THEN RAISE EXCEPTION 'payment method unavailable'; END IF;
  IF COALESCE(trim(_target),'') = '' OR COALESCE(trim(_full_name),'') = '' THEN RAISE EXCEPTION 'missing required fields'; END IF;
  IF _product = 'ai_receptionist' THEN
    SELECT price INTO _total FROM public.product_prices WHERE product=_product AND option_key=_channel;
    IF _total IS NULL THEN RAISE EXCEPTION 'unknown channel'; END IF;
  ELSIF _product = 'messaging_ai' THEN
    IF COALESCE(array_length(_msg_channels,1),0) = 0 THEN RAISE EXCEPTION 'choose at least one channel'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(_msg_channels) c WHERE c NOT IN ('whatsapp','messenger','telegram')) THEN RAISE EXCEPTION 'unknown channel'; END IF;
    SELECT price INTO _base FROM public.product_prices WHERE product=_product AND option_key='base';
    SELECT price INTO _extra FROM public.product_prices WHERE product=_product AND option_key='extra_channel';
    _total := _base + GREATEST(0, array_length(_msg_channels,1)-1) * _extra;
    _channel := array_to_string(_msg_channels, ',');
  ELSE RAISE EXCEPTION 'product not orderable'; END IF;
  INSERT INTO public.orders (client_id, automation_type, delivery_channel, selected_features, full_name, company_name,
    contact_email, country, target_domain_url, total_amount, payment_method_id, payment_proof_data, origin_domain)
  VALUES (_cid, _product, _channel, COALESCE(_features,'[]'::jsonb), trim(_full_name), COALESCE(trim(_company),''),
    trim(_email), trim(_country), trim(_target), _total, _method, COALESCE(_proof,'{}'::jsonb), COALESCE(_origin,''))
  RETURNING order_id INTO _oid;
  RETURN _oid;
END $$;
REVOKE EXECUTE ON FUNCTION public.place_order(text,text,text[],jsonb,text,text,text,text,text,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(text,text,text[],jsonb,text,text,text,text,text,uuid,jsonb) TO authenticated;
DROP POLICY IF EXISTS orders_own_insert ON public.orders;

-- system_settings: public may only read display flags
DROP POLICY IF EXISTS "settings public read" ON public.system_settings;
CREATE POLICY "settings public read" ON public.system_settings FOR SELECT USING (key IN ('maintenance','feature_flags','banner') OR public.is_admin(auth.uid()));

-- Canonical audit trail
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS before_value jsonb,
  ADD COLUMN IF NOT EXISTS after_value jsonb,
  ADD COLUMN IF NOT EXISTS source_ip text,
  ADD COLUMN IF NOT EXISTS client_id text;
COMMENT ON TABLE public.audit_log IS 'DEPRECATED: replaced by audit_logs';

-- Conversation metadata for widget sessions
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS visitor_session text,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS conversations_session_uidx ON public.conversations(automation_id, visitor_session) WHERE visitor_session IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_conv_idx ON public.messages(conversation_id, created_at);

-- Installation heartbeat
ALTER TABLE public.client_automations
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_origin text;

-- LLM router: Gen 2 provider pool with health data
ALTER TABLE public.llm_api_keys DROP CONSTRAINT IF EXISTS llm_api_keys_provider_check;
ALTER TABLE public.llm_api_keys ADD CONSTRAINT llm_api_keys_provider_check CHECK (provider IN ('openrouter','groq','lovable'));
ALTER TABLE public.llm_api_keys
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

CREATE TABLE public.llm_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid REFERENCES public.client_automations(id) ON DELETE SET NULL,
  key_id uuid REFERENCES public.llm_api_keys(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL,
  http_status integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.llm_requests TO authenticated;
GRANT ALL ON public.llm_requests TO service_role;
ALTER TABLE public.llm_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY llmr_admin_read ON public.llm_requests FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX llm_requests_auto_idx ON public.llm_requests(automation_id, created_at DESC);
CREATE INDEX llm_requests_created_idx ON public.llm_requests(created_at DESC);

-- Usage metering (server only)
CREATE OR REPLACE FUNCTION public.record_usage(_automation_id uuid, _tokens bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.usage_meters (automation_id, billing_period, tokens_used)
  VALUES (_automation_id, to_char(now(),'YYYY-MM'), _tokens)
  ON CONFLICT (automation_id, billing_period) DO UPDATE SET tokens_used = usage_meters.tokens_used + EXCLUDED.tokens_used, updated_at = now();
$$;
REVOKE EXECUTE ON FUNCTION public.record_usage(uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_usage(uuid,bigint) TO service_role;

COMMENT ON TABLE public.transcripts IS 'DEPRECATED: replaced by conversations/messages';
COMMENT ON TABLE public.widget_rate_limits IS 'DEPRECATED: Gen 2 widget rate-limits from messages volume';
COMMENT ON TABLE public.groq_keys IS 'DEPRECATED: replaced by llm_api_keys';
COMMENT ON TABLE public.groq_failover_log IS 'DEPRECATED: replaced by llm_requests';