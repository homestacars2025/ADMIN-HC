-- Add image generation columns to social.sm_content_social
-- Run this in the Supabase SQL editor at: https://supabase.com/dashboard/project/edsyoxqsnsxfftnbsjgq/sql/new

ALTER TABLE social.sm_content_social
  ADD COLUMN IF NOT EXISTS generated_images    jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS base_car_photo_url  text,
  ADD COLUMN IF NOT EXISTS used_car_id         integer,
  ADD COLUMN IF NOT EXISTS used_model_group_id integer,
  ADD COLUMN IF NOT EXISTS image_status        text         NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS image_review_note   text,
  ADD COLUMN IF NOT EXISTS image_time_mood     text,
  ADD COLUMN IF NOT EXISTS image_environment   text,
  ADD COLUMN IF NOT EXISTS image_generated_at  timestamptz;

-- Ensure the generated-images storage bucket exists and is public
-- (run separately if the bucket doesn't exist yet)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('generated-images', 'generated-images', true)
-- ON CONFLICT (id) DO NOTHING;
