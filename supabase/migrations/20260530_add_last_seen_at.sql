-- Add last_seen_at to profiles for historical presence tracking
-- Run in: https://supabase.com/dashboard/project/edsyoxqsnsxfftnbsjgq/sql/new

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
