-- Extend guests table with fields used by the Guests page UI
-- Safe to run multiple times due to IF NOT EXISTS

ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS nationality text;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS id_doc_type text; -- 'passport' | 'national_id'
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS id_doc_number text;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS id_doc_url text;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS id_doc_uploaded_at timestamp with time zone;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS is_vip boolean DEFAULT false;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

-- Trigger to maintain updated_at (drop/recreate to avoid DO $$ issues)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guests_set_updated_at ON public.guests;
CREATE TRIGGER trg_guests_set_updated_at
BEFORE UPDATE ON public.guests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_guests_phone ON public.guests (phone);
CREATE INDEX IF NOT EXISTS idx_guests_national_id ON public.guests (national_id);
CREATE INDEX IF NOT EXISTS idx_guests_full_name ON public.guests (full_name);
CREATE INDEX IF NOT EXISTS idx_guests_avatar_url ON public.guests (avatar_url);
