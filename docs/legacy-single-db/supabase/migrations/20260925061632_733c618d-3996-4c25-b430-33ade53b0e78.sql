CREATE TABLE public.transcript_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  automation_id uuid REFERENCES public.automation_instances(id) ON DELETE CASCADE,
  transcript text NOT NULL,
  tone_score integer NOT NULL DEFAULT 0,
  accuracy_score integer NOT NULL DEFAULT 0,
  helpfulness_score integer NOT NULL DEFAULT 0,
  overall_score integer NOT NULL DEFAULT 0,
  summary text NOT NULL DEFAULT '',
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvements jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.transcript_evaluations TO authenticated;
GRANT ALL ON public.transcript_evaluations TO service_role;
ALTER TABLE public.transcript_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own evaluations read" ON public.transcript_evaluations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "own evaluations insert" ON public.transcript_evaluations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (automation_id IS NULL OR public.owns_automation(automation_id) OR public.is_staff(auth.uid())));
CREATE POLICY "own evaluations delete" ON public.transcript_evaluations FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings public read" ON public.system_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "settings admin insert" ON public.system_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "settings admin update" ON public.system_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
INSERT INTO public.system_settings (key, value) VALUES
  ('banner', '{"enabled": false, "message": "", "tone": "info"}'),
  ('maintenance', '{"enabled": false, "message": "We are performing scheduled maintenance. Please check back shortly."}'),
  ('feature_flags', '{"transcript_evaluator": true, "test_chat": true, "public_storefront": true}');