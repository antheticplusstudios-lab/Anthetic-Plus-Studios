-- DB2 app_billing: align live orders with Gen 2 contract (amount -> total_amount).
-- Live check 2026-10-02: amount exists, total_amount absent, 0 rows.
-- Rename preserves every value; no defaults, no fabricated data.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='total_amount')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='amount') THEN
    RAISE EXCEPTION 'Both amount and total_amount exist - stop and investigate';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='amount') THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE amount IS NULL OR amount < 0) THEN
      RAISE EXCEPTION 'orders.amount has NULL or negative values - stop and investigate';
    END IF;
    ALTER TABLE public.orders RENAME COLUMN amount TO total_amount;
    ALTER TABLE public.orders ALTER COLUMN total_amount TYPE numeric(12,2);
    ALTER TABLE public.orders ALTER COLUMN total_amount DROP DEFAULT;
    ALTER TABLE public.orders ALTER COLUMN total_amount SET NOT NULL;
    ALTER TABLE public.orders ADD CONSTRAINT orders_total_amount_nonneg CHECK (total_amount >= 0);
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
