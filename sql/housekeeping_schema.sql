-- Housekeeping & laundry schema
-- Run this in Supabase SQL editor

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Master list of linen / amenities tracked in laundry
CREATE TABLE IF NOT EXISTS public.laundry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'قطعة',
  active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

-- Inventory by item (current on-hand count in hotel store)
CREATE TABLE IF NOT EXISTS public.laundry_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.laundry_items(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 0,
  CONSTRAINT laundry_stock_quantity_nonneg CHECK (quantity >= 0),
  UNIQUE (item_id)
);

-- Movements: to outside laundry, returned, internal discard, adjustments
CREATE TABLE IF NOT EXISTS public.laundry_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.laundry_items(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('out','in','adjust','discard')),
  quantity int NOT NULL CHECK (quantity > 0),
  room_id uuid NULL REFERENCES public.rooms(id) ON DELETE SET NULL,
  reservation_id uuid NULL REFERENCES public.reservations(id) ON DELETE SET NULL,
  note text NULL,
  created_at timestamp DEFAULT now(),
  created_by uuid NULL REFERENCES public.staff_users(id) ON DELETE SET NULL
);

-- Keep stock in sync based on movements
CREATE OR REPLACE FUNCTION public.laundry_movements_apply()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_delta int;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.direction = 'out' OR NEW.direction = 'discard' THEN
    v_delta := - NEW.quantity;
  ELSIF NEW.direction = 'in' OR NEW.direction = 'adjust' THEN
    v_delta := NEW.quantity;
  ELSE
    v_delta := 0;
  END IF;

  INSERT INTO public.laundry_stock (item_id, quantity)
  VALUES (NEW.item_id, GREATEST(v_delta,0))
  ON CONFLICT (item_id) DO UPDATE
    SET quantity = GREATEST(public.laundry_stock.quantity + v_delta, 0);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_laundry_movements_apply ON public.laundry_movements;
CREATE TRIGGER trg_laundry_movements_apply
AFTER INSERT ON public.laundry_movements
FOR EACH ROW EXECUTE FUNCTION public.laundry_movements_apply();

-- Housekeeping tasks per room / day
CREATE TABLE IF NOT EXISTS public.housekeeping_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  reservation_id uuid NULL REFERENCES public.reservations(id) ON DELETE SET NULL,
  task_date date NOT NULL DEFAULT current_date,
  task_type text NOT NULL CHECK (task_type IN ('checkout_clean','stayover_clean','deep_clean','inspect_only','linen_change')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','skipped')),
  priority int NOT NULL DEFAULT 2,
  notes text NULL,
  created_at timestamp DEFAULT now(),
  created_by uuid NULL REFERENCES public.staff_users(id) ON DELETE SET NULL,
  assigned_to uuid NULL REFERENCES public.staff_users(id) ON DELETE SET NULL,
  started_at timestamp NULL,
  finished_at timestamp NULL
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_room_date ON public.housekeeping_tasks(room_id, task_date);
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_status ON public.housekeeping_tasks(status);

-- When room is marked clean, auto-complete open tasks for today
CREATE OR REPLACE FUNCTION public.on_room_clean_mark_tasks_done()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cleanliness = 'clean' AND (OLD.cleanliness IS DISTINCT FROM NEW.cleanliness) THEN
      UPDATE public.housekeeping_tasks
         SET status = 'done', finished_at = now()
       WHERE room_id = NEW.id
         AND task_date = current_date
         AND status IN ('pending','in_progress');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_clean_tasks_done ON public.rooms;
CREATE TRIGGER trg_room_clean_tasks_done
AFTER UPDATE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.on_room_clean_mark_tasks_done();
