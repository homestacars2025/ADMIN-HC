-- ============================================================
-- HOMESTACARS SECURITY LOCKDOWN
-- Run every statement in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ⚠️  BEFORE RUNNING: confirm your own profiles.role = 'admin'
--     SELECT id, email, role FROM public.profiles WHERE email = 'homestacars@gmail.com';
-- ============================================================


-- ============================================================
-- STEP 1: Helper function — avoids RLS recursion on profiles
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
$$;


-- ============================================================
-- STEP 2: Drop ALL existing policies then re-create admin-only ones
-- This guarantees no stale permissive policy survives.
-- Run table by table — if a table doesn't exist you'll get a safe error.
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.profiles
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── bookings ─────────────────────────────────────────────────
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bookings'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.bookings', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.bookings
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── cars ──────────────────────────────────────────────────────
ALTER TABLE public.cars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cars FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cars'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.cars', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.cars
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── customers ─────────────────────────────────────────────────
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customers'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.customers', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.customers
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── investors ─────────────────────────────────────────────────
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investors FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'investors'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.investors', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.investors
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── company_expenses ──────────────────────────────────────────
ALTER TABLE public.company_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_expenses FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_expenses'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_expenses', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.company_expenses
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── financial_transactions ────────────────────────────────────
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'financial_transactions'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.financial_transactions', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.financial_transactions
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── exchange_rates ────────────────────────────────────────────
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exchange_rates'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.exchange_rates', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.exchange_rates
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── cars_registration ─────────────────────────────────────────
ALTER TABLE public.cars_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cars_registration FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cars_registration'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.cars_registration', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.cars_registration
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── car_tracking ──────────────────────────────────────────────
ALTER TABLE public.car_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_tracking FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'car_tracking'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.car_tracking', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.car_tracking
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── operations ────────────────────────────────────────────────
ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operations'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.operations', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.operations
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── kgm ───────────────────────────────────────────────────────
ALTER TABLE public.kgm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kgm FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'kgm'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.kgm', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.kgm
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── traffic_fines ─────────────────────────────────────────────
ALTER TABLE public.traffic_fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_fines FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'traffic_fines'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.traffic_fines', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.traffic_fines
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── model_group ───────────────────────────────────────────────
-- Try both spellings; one will succeed, the other will produce a harmless error.
ALTER TABLE public.model_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_group FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'model_group'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.model_group', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.model_group
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── car_pricing_tiers (table, not view) ───────────────────────
-- Skip if Supabase reports this is a view — views inherit base-table RLS
ALTER TABLE public.car_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_pricing_tiers FORCE ROW LEVEL SECURITY;

DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'car_pricing_tiers'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.car_pricing_tiers', pol.policyname); END LOOP;
END $$;

CREATE POLICY "admin_only" ON public.car_pricing_tiers
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- STEP 3: Storage bucket lockdown
-- ============================================================

-- Make both buckets private (not public)
UPDATE storage.buckets SET public = false WHERE id IN ('customers_doc', 'avatars', 'doc');

-- Drop any existing storage policies for these buckets
DO $$ DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- customers_doc bucket — admin only
CREATE POLICY "customers_doc_admin_only" ON storage.objects
  FOR ALL TO authenticated
  USING  (bucket_id = 'customers_doc' AND public.is_admin())
  WITH CHECK (bucket_id = 'customers_doc' AND public.is_admin());

-- avatars bucket — admin only
CREATE POLICY "avatars_admin_only" ON storage.objects
  FOR ALL TO authenticated
  USING  (bucket_id = 'avatars' AND public.is_admin())
  WITH CHECK (bucket_id = 'avatars' AND public.is_admin());

-- doc bucket — admin only
CREATE POLICY "doc_admin_only" ON storage.objects
  FOR ALL TO authenticated
  USING  (bucket_id = 'doc' AND public.is_admin())
  WITH CHECK (bucket_id = 'doc' AND public.is_admin());


-- ============================================================
-- STEP 4: Verify — run these queries to confirm RLS is active
-- ============================================================

-- Check RLS is enabled on all tables
SELECT tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles','bookings','cars','customers','investors',
    'company_expenses','financial_transactions','exchange_rates',
    'cars_registration','car_tracking','operations','kgm',
    'traffic_fines','model_group','car_pricing_tiers'
  )
ORDER BY tablename;
-- Expected: rowsecurity = true, forcerowsecurity = true for every row

-- Check all policies are named "admin_only"
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected: only "admin_only" policies on every table

-- Test as a staff user (impersonate via Supabase Auth → Users → "Log in as user")
-- Then run:
-- SELECT * FROM public.bookings LIMIT 1;
-- Expected: 0 rows returned (RLS blocks it), NOT an error
