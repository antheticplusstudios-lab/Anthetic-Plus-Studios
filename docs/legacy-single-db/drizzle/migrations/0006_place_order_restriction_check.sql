CREATE OR REPLACE FUNCTION public.place_order(_product text, _channel text, _msg_channels text[], _features jsonb,
  _full_name text, _company text, _email text, _country text, _target text, _method uuid, _proof jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid text; _origin text; _total numeric; _oid text; _base numeric; _extra numeric;
BEGIN
  IF public.is_blocked(auth.uid()) OR public.is_muted(auth.uid()) THEN RAISE EXCEPTION 'your account is restricted'; END IF;
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