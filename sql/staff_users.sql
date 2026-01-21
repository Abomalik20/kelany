-- Staff users and roles for Kelany Hotel PMS
-- Run this script once in Supabase (SQL editor) on your database

-- Enable pgcrypto for password hashing (bcrypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Table: staff_users
CREATE TABLE IF NOT EXISTS public.staff_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  full_name     text NOT NULL,
  role          text NOT NULL CHECK (role IN ('manager','assistant_manager','reception','housekeeping')),
  password_hash text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NULL REFERENCES public.staff_users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.staff_users IS 'Internal staff accounts for PMS (manager, assistant manager, reception, housekeeping).';
COMMENT ON COLUMN public.staff_users.username IS 'Login username defined by the manager.';
COMMENT ON COLUMN public.staff_users.role IS 'One of: manager, assistant_manager, reception, housekeeping.';

-- Create an initial manager account bound to the manager email
-- Default credentials (for first login only):
--   username: x2008666@gmail.com
--   password: kelany123
INSERT INTO public.staff_users (username, full_name, role, password_hash)
SELECT 'x2008666@gmail.com', 'مدير الفندق', 'manager', crypt('kelany123', gen_salt('bf'))
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff_users WHERE username = 'x2008666@gmail.com'
);

-- Secure login function: checks password server-side and returns safe fields only
CREATE OR REPLACE FUNCTION public.login_staff_user(
  p_username text,
  p_password text
)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  role text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  u public.staff_users;
BEGIN
  SELECT * INTO u
  FROM public.staff_users s
  WHERE s.username = p_username
    AND s.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_LOGIN' USING MESSAGE = 'اسم المستخدم أو كلمة المرور غير صحيحة.';
  END IF;

  IF crypt(p_password, u.password_hash) <> u.password_hash THEN
    RAISE EXCEPTION 'INVALID_LOGIN' USING MESSAGE = 'اسم المستخدم أو كلمة المرور غير صحيحة.';
  END IF;
  
  -- Return a single row with safe fields
  RETURN QUERY
  SELECT u.id, u.username, u.full_name, u.role, u.is_active;
END;
$$;

COMMENT ON FUNCTION public.login_staff_user(text, text) IS 'Validate staff username/password and return basic user info (without password hash).';

-- Allow Supabase anon/authenticated roles to call the login function via RPC
GRANT EXECUTE ON FUNCTION public.login_staff_user(text, text) TO anon, authenticated;

-- Create staff user (manager-only via app logic; hashes password server-side)
CREATE OR REPLACE FUNCTION public.create_staff_user(
  p_username   text,
  p_full_name  text,
  p_role       text,
  p_password   text,
  p_created_by uuid
)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  role text,
  is_active boolean,
  created_at timestamptz,
  created_by uuid
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.staff_users (username, full_name, role, password_hash, created_by)
  VALUES (
    p_username,
    p_full_name,
    p_role,
    crypt(p_password, gen_salt('bf')),
    p_created_by
  )
  RETURNING id, username, full_name, role, is_active, created_at, created_by;
$$;

GRANT EXECUTE ON FUNCTION public.create_staff_user(text, text, text, text, uuid) TO anon, authenticated;

-- Update staff user basic info (excluding password)
CREATE OR REPLACE FUNCTION public.update_staff_user(
  p_id         uuid,
  p_full_name  text,
  p_role       text,
  p_is_active  boolean,
  p_updated_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.staff_users
  SET full_name = p_full_name,
      role = p_role,
      is_active = p_is_active,
      updated_by = p_updated_by
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_staff_user(uuid, text, text, boolean, uuid) TO anon, authenticated;

-- Set / reset staff user password
CREATE OR REPLACE FUNCTION public.set_staff_user_password(
  p_id         uuid,
  p_password   text,
  p_updated_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.staff_users
  SET password_hash = crypt(p_password, gen_salt('bf')),
      updated_by    = p_updated_by
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_staff_user_password(uuid, text, uuid) TO anon, authenticated;

-- Optional: simple view without password hash (for admin screens later)
CREATE OR REPLACE VIEW public.staff_users_overview AS
SELECT
  s.id,
  s.username,
  s.full_name,
  s.role,
  s.is_active,
  s.created_at,
  s.created_by,
  creator.full_name AS created_by_name,
  creator.username AS created_by_username
FROM public.staff_users s
LEFT JOIN public.staff_users creator ON creator.id = s.created_by;

-- ---------------------------------------------------------------------------
-- Staff activity log: سجل نشاط احترافي لمتابعة عمليات الموظفين
-- ---------------------------------------------------------------------------

-- Generic activity log for staff operations (buildings, reservations, guests, ...)
CREATE TABLE IF NOT EXISTS public.staff_activity_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NULL REFERENCES public.staff_users(id) ON DELETE SET NULL,
  entity_type   text NOT NULL,   -- e.g. 'building','reservation','guest','room','floor'
  entity_id     uuid NULL,       -- target record id when available
  action        text NOT NULL,   -- e.g. 'create','update','delete','check_in','check_out'
  details       text NULL,       -- human readable description (Arabic)
  metadata      jsonb NULL,      -- optional structured data (old/new values, etc.)
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff_activity_log IS 'Audit log for staff actions (buildings, reservations, guests, etc.).';
COMMENT ON COLUMN public.staff_activity_log.staff_user_id IS 'Reference to staff_users.id that performed the action.';
COMMENT ON COLUMN public.staff_activity_log.entity_type IS 'Logical entity type: building, reservation, guest, room, floor, ...';
COMMENT ON COLUMN public.staff_activity_log.action IS 'Action verb: create, update, delete, check_in, check_out, ...';

CREATE INDEX IF NOT EXISTS idx_staff_activity_entity ON public.staff_activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_staff_activity_staff ON public.staff_activity_log(staff_user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Link core tables to staff users (created_by / updated_by)
-- ---------------------------------------------------------------------------

-- Reservations: track who created / آخر من عدّل الحجز
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;

-- Guests: track who created / آخر من عدّل النزيل
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;

-- Buildings: track who created / آخر من عدّل المبنى
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;

-- Rooms: track who created / آخر من عدّل الغرفة
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;

-- Floors: track who created / آخر من عدّل الطابق
ALTER TABLE public.floors ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;
ALTER TABLE public.floors ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;

-- Room types: track who created / آخر من عدّل نوع الغرفة
ALTER TABLE public.room_types ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;
ALTER TABLE public.room_types ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;

-- Staff users: track آخر من عدّل بيانات المستخدم (بخلاف من أنشأه)
ALTER TABLE public.staff_users ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Triggers: سجل نشاط للتعديلات والحذف على المباني
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_building_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
  v_staff  uuid;
  v_id     uuid;
  v_name   text;
  v_code   text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_staff  := NEW.created_by;
    v_id     := NEW.id;
    v_name   := NEW.name;
    v_code   := COALESCE(NEW.code, NEW.name);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Treat update to is_deleted=true as a logical delete
    IF (OLD.is_deleted IS DISTINCT FROM TRUE) AND (NEW.is_deleted IS TRUE) THEN
      v_action := 'delete';
    ELSE
      v_action := 'update';
    END IF;
    v_staff := COALESCE(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
    v_id    := NEW.id;
    v_name  := COALESCE(NEW.name, OLD.name);
    v_code  := COALESCE(NEW.code, OLD.code, COALESCE(NEW.name, OLD.name));
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_staff  := COALESCE(OLD.updated_by, OLD.created_by);
    v_id     := OLD.id;
    v_name   := OLD.name;
    v_code   := COALESCE(OLD.code, OLD.name);
  END IF;

  INSERT INTO public.staff_activity_log (staff_user_id, entity_type, entity_id, action, details, metadata)
  VALUES (
    v_staff,
    'building',
    v_id,
    v_action,
    format('مبنى: %s (كود/اسم: %s)', COALESCE(v_name, 'بدون اسم'), COALESCE(v_code, 'غير محدد')),
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_buildings_activity ON public.buildings;
CREATE TRIGGER trg_buildings_activity
AFTER INSERT OR UPDATE OR DELETE ON public.buildings
FOR EACH ROW EXECUTE FUNCTION public.log_building_activity();

-- ---------------------------------------------------------------------------
-- Triggers: سجل نشاط للحجوزات (إنشاء/تعديل/حذف، تغيير حالة، مدفوعات...)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_reservation_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
  v_staff  uuid;
  v_id     uuid;
  v_guest_name  text;
  v_room_label  text;
  v_status_old text;
  v_status_new text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_staff  := NEW.created_by;
    v_id     := NEW.id;
    -- Resolve guest name and room label for human-readable details
    IF NEW.guest_id IS NOT NULL THEN
      SELECT g.full_name INTO v_guest_name FROM public.guests g WHERE g.id = NEW.guest_id;
    END IF;
    IF NEW.room_id IS NOT NULL THEN
      SELECT COALESCE(NULLIF(rm.room_number, ''), NULLIF(rm.room_code, ''), 'غرفة #' || left(rm.id::text, 8))
      INTO v_room_label
      FROM public.rooms rm
      WHERE rm.id = NEW.room_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_staff  := coalesce(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
    v_id     := NEW.id;
    v_status_old := coalesce(OLD.status::text, '');
    v_status_new := coalesce(NEW.status::text, '');
    IF v_status_old IS DISTINCT FROM v_status_new THEN
      v_action := 'status_change';
    END IF;
    -- Resolve guest name and room label using NEW/OLD
    IF coalesce(NEW.guest_id, OLD.guest_id) IS NOT NULL THEN
      SELECT g.full_name INTO v_guest_name FROM public.guests g WHERE g.id = coalesce(NEW.guest_id, OLD.guest_id);
    END IF;
    IF coalesce(NEW.room_id, OLD.room_id) IS NOT NULL THEN
      SELECT COALESCE(NULLIF(rm.room_number, ''), NULLIF(rm.room_code, ''), 'غرفة #' || left(rm.id::text, 8))
      INTO v_room_label
      FROM public.rooms rm
      WHERE rm.id = coalesce(NEW.room_id, OLD.room_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_staff  := coalesce(OLD.updated_by, OLD.created_by);
    v_id     := OLD.id;
    IF OLD.guest_id IS NOT NULL THEN
      SELECT g.full_name INTO v_guest_name FROM public.guests g WHERE g.id = OLD.guest_id;
    END IF;
    IF OLD.room_id IS NOT NULL THEN
      SELECT COALESCE(NULLIF(rm.room_number, ''), NULLIF(rm.room_code, ''), 'غرفة #' || left(rm.id::text, 8))
      INTO v_room_label
      FROM public.rooms rm
      WHERE rm.id = OLD.room_id;
    END IF;
  END IF;

  INSERT INTO public.staff_activity_log (staff_user_id, entity_type, entity_id, action, details, metadata)
  VALUES (
    v_staff,
    'reservation',
    v_id,
    v_action,
    CASE
      WHEN v_action = 'create' THEN
        format(
          'إضافة حجز للنزيل %s في %s من %s إلى %s',
          coalesce(v_guest_name, 'نزيل غير محدد'),
          coalesce(v_room_label, 'غرفة غير معروفة'),
          coalesce(coalesce(NEW.check_in_date, OLD.check_in_date)::text, '-'),
          coalesce(coalesce(NEW.check_out_date, OLD.check_out_date)::text, '-')
        )
      WHEN v_action = 'delete' THEN
        format(
          'حذف حجز للنزيل %s في %s للفترة من %s إلى %s',
          coalesce(v_guest_name, 'نزيل غير محدد'),
          coalesce(v_room_label, 'غرفة غير معروفة'),
          coalesce(OLD.check_in_date::text, '-'),
          coalesce(OLD.check_out_date::text, '-')
        )
      WHEN v_action = 'status_change' THEN
        format(
          'تغيير حالة حجز للنزيل %s من %s إلى %s',
          coalesce(v_guest_name, 'نزيل غير محدد'),
          coalesce(v_status_old, '-'),
          coalesce(v_status_new, '-')
        )
      ELSE
        format(
          'تعديل حجز للنزيل %s في %s (حالة حالية: %s)',
          coalesce(v_guest_name, 'نزيل غير محدد'),
          coalesce(v_room_label, 'غرفة غير معروفة'),
          coalesce(v_status_new, coalesce(v_status_old, '-'))
        )
    END,
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_reservations_activity ON public.reservations;
CREATE TRIGGER trg_reservations_activity
AFTER INSERT OR UPDATE OR DELETE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.log_reservation_activity();

-- ---------------------------------------------------------------------------
-- Triggers: سجل نشاط للنزلاء (إنشاء/تعديل/حذف)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_guest_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
  v_staff  uuid;
  v_id     uuid;
  v_name   text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_staff  := NEW.created_by;
    v_id     := NEW.id;
    v_name   := coalesce(NEW.full_name, '');
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_staff  := coalesce(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
    v_id     := NEW.id;
    v_name   := coalesce(NEW.full_name, OLD.full_name, '');
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_staff  := coalesce(OLD.updated_by, OLD.created_by);
    v_id     := OLD.id;
    v_name   := coalesce(OLD.full_name, '');
  END IF;

  INSERT INTO public.staff_activity_log (staff_user_id, entity_type, entity_id, action, details, metadata)
  VALUES (
    v_staff,
    'guest',
    v_id,
    v_action,
    CASE
      WHEN v_action = 'create' THEN
        format('إضافة نزيل جديد: %s', coalesce(v_name, 'بدون اسم'))
      WHEN v_action = 'delete' THEN
        format('حذف نزيل: %s', coalesce(v_name, 'بدون اسم'))
      ELSE
        format('تعديل بيانات نزيل: %s', coalesce(v_name, 'بدون اسم'))
    END,
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guests_activity ON public.guests;
CREATE TRIGGER trg_guests_activity
AFTER INSERT OR UPDATE OR DELETE ON public.guests
FOR EACH ROW EXECUTE FUNCTION public.log_guest_activity();

-- ---------------------------------------------------------------------------
-- Triggers: سجل نشاط للغرف (إنشاء/تعديل/حذف، تغيير حالة/نظافة)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_room_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
  v_staff  uuid;
  v_id     uuid;
  v_code   text;
  v_status text;
  v_clean  text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_staff  := NEW.created_by;
    v_id     := NEW.id;
    v_code   := coalesce(NEW.room_code, '');
    v_status := coalesce(NEW.status::text, '');
    v_clean  := coalesce(NEW.cleanliness::text, '');
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_staff  := coalesce(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
    v_id     := NEW.id;
    v_code   := coalesce(NEW.room_code, OLD.room_code, '');
    v_status := coalesce(NEW.status::text, OLD.status::text, '');
    v_clean  := coalesce(NEW.cleanliness::text, OLD.cleanliness::text, '');
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_staff  := coalesce(OLD.updated_by, OLD.created_by);
    v_id     := OLD.id;
    v_code   := coalesce(OLD.room_code, '');
    v_status := coalesce(OLD.status::text, '');
    v_clean  := coalesce(OLD.cleanliness::text, '');
  END IF;

  INSERT INTO public.staff_activity_log (staff_user_id, entity_type, entity_id, action, details, metadata)
  VALUES (
    v_staff,
    'room',
    v_id,
    v_action,
    format('غرفة: %s (حالة: %s، نظافة: %s)', coalesce(nullif(v_code, ''), 'بدون رمز'), coalesce(nullif(v_status, ''), '-'), coalesce(nullif(v_clean, ''), '-')),
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_rooms_activity ON public.rooms;
CREATE TRIGGER trg_rooms_activity
AFTER INSERT OR UPDATE OR DELETE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.log_room_activity();

-- ---------------------------------------------------------------------------
-- Triggers: سجل نشاط للطوابق
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_floor_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
  v_staff  uuid;
  v_id     uuid;
  v_name   text;
  v_number text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_staff  := NEW.created_by;
    v_id     := NEW.id;
    v_name   := coalesce(NEW.floor_name, NEW.name, '');
    v_number := coalesce(NEW.floor_number::text, NEW.number::text, '');
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_staff  := coalesce(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
    v_id     := NEW.id;
    v_name   := coalesce(NEW.floor_name, NEW.name, OLD.floor_name, OLD.name, '');
    v_number := coalesce(NEW.floor_number::text, NEW.number::text, OLD.floor_number::text, OLD.number::text, '');
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_staff  := coalesce(OLD.updated_by, OLD.created_by);
    v_id     := OLD.id;
    v_name   := coalesce(OLD.floor_name, OLD.name, '');
    v_number := coalesce(OLD.floor_number::text, OLD.number::text, '');
  END IF;

  INSERT INTO public.staff_activity_log (staff_user_id, entity_type, entity_id, action, details, metadata)
  VALUES (
    v_staff,
    'floor',
    v_id,
    v_action,
    format('طابق: %s (رقم: %s)', coalesce(nullif(v_name, ''), 'بدون اسم'), coalesce(nullif(v_number, ''), '-')),
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_floors_activity ON public.floors;
CREATE TRIGGER trg_floors_activity
AFTER INSERT OR UPDATE OR DELETE ON public.floors
FOR EACH ROW EXECUTE FUNCTION public.log_floor_activity();

-- ---------------------------------------------------------------------------
-- Triggers: سجل نشاط لأنواع الغرف
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_room_type_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
  v_staff  uuid;
  v_id     uuid;
  v_name   text;
  v_code   text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_staff  := NEW.created_by;
    v_id     := NEW.id;
    v_name   := coalesce(NEW.name_ar, NEW.name, '');
    v_code   := coalesce(NEW.code, '');
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_staff  := coalesce(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
    v_id     := NEW.id;
    v_name   := coalesce(NEW.name_ar, NEW.name, OLD.name_ar, OLD.name, '');
    v_code   := coalesce(NEW.code, OLD.code, '');
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_staff  := coalesce(OLD.updated_by, OLD.created_by);
    v_id     := OLD.id;
    v_name   := coalesce(OLD.name_ar, OLD.name, '');
    v_code   := coalesce(OLD.code, '');
  END IF;

  INSERT INTO public.staff_activity_log (staff_user_id, entity_type, entity_id, action, details, metadata)
  VALUES (
    v_staff,
    'room_type',
    v_id,
    v_action,
    format('نوع غرفة: %s (كود: %s)', coalesce(nullif(v_name, ''), 'بدون اسم'), coalesce(nullif(v_code, ''), '-')),
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_room_types_activity ON public.room_types;
CREATE TRIGGER trg_room_types_activity
AFTER INSERT OR UPDATE OR DELETE ON public.room_types
FOR EACH ROW EXECUTE FUNCTION public.log_room_type_activity();

-- ---------------------------------------------------------------------------
-- Triggers: سجل نشاط لمستخدمي النظام (staff_users)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_staff_user_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
  v_staff  uuid; -- من قام بالفعل
  v_id     uuid; -- المستخدم الهدف
  v_name   text;
  v_username text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action  := 'create';
    v_staff   := NEW.created_by;
    v_id      := NEW.id;
    v_name    := coalesce(NEW.full_name, '');
    v_username := coalesce(NEW.username, '');
  ELSIF TG_OP = 'UPDATE' THEN
    v_action  := 'update';
    v_staff   := coalesce(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
    v_id      := NEW.id;
    v_name    := coalesce(NEW.full_name, OLD.full_name, '');
    v_username := coalesce(NEW.username, OLD.username, '');
  ELSIF TG_OP = 'DELETE' THEN
    v_action  := 'delete';
    v_staff   := coalesce(OLD.updated_by, OLD.created_by);
    v_id      := OLD.id;
    v_name    := coalesce(OLD.full_name, '');
    v_username := coalesce(OLD.username, '');
  END IF;

  INSERT INTO public.staff_activity_log (staff_user_id, entity_type, entity_id, action, details, metadata)
  VALUES (
    v_staff,
    'staff_user',
    v_id,
    v_action,
    CASE
      WHEN v_action = 'create' THEN format('إنشاء مستخدم جديد: %s (%s)', coalesce(nullif(v_name, ''), 'بدون اسم'), coalesce(nullif(v_username, ''), '-'))
      WHEN v_action = 'delete' THEN format('حذف مستخدم: %s (%s)', coalesce(nullif(v_name, ''), 'بدون اسم'), coalesce(nullif(v_username, ''), '-'))
      ELSE format('تعديل بيانات مستخدم: %s (%s)', coalesce(nullif(v_name, ''), 'بدون اسم'), coalesce(nullif(v_username, ''), '-'))
    END,
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_users_activity ON public.staff_users;
CREATE TRIGGER trg_staff_users_activity
AFTER INSERT OR UPDATE OR DELETE ON public.staff_users
FOR EACH ROW EXECUTE FUNCTION public.log_staff_user_activity();

-- ---------------------------------------------------------------------------
-- View: staff_activity_overview لعرض سجل النشاطات بصورة جاهزة للواجهة
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.staff_activity_overview AS
SELECT
  l.id,
  l.staff_user_id,
  su.full_name  AS staff_name,
  su.username   AS staff_username,
  l.entity_type,
  l.entity_id,
  l.action,
  l.details,
  l.metadata,
  l.created_at
FROM public.staff_activity_log l
LEFT JOIN public.staff_users su ON su.id = l.staff_user_id;


