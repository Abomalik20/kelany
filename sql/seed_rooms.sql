-- Seed buildings, floors, and rooms for Tashkeen
-- Run this in Supabase SQL editor

DO $$
DECLARE
  v_rt uuid;
  v_new_building uuid;
  v_old_building uuid;
  v_new_f1 uuid;
  v_new_f2 uuid;
  v_new_f3 uuid;
  v_old_f1 uuid;
  v_old_f2 uuid;
  v_tmp uuid;
BEGIN
  -- Cleanup: remove existing target buildings/floors/rooms before re-seeding
  -- Note: If there are reservations referencing these rooms, deletion may fail
  -- depending on foreign key constraints. Handle reservations separately if needed.
  FOR v_tmp IN 
    SELECT id FROM public.buildings 
    WHERE name IN ('المبنى الجديد','المبنى القديم')
       OR name ILIKE ANY(ARRAY['%المبنى الجديد%','%المبنى القديم%'])
  LOOP
    -- Delete reservations linked to rooms in this building first
    DELETE FROM public.reservations WHERE room_id IN (
      SELECT id FROM public.rooms WHERE building_id = v_tmp
    );
    -- Then delete rooms, floors, and the building
    DELETE FROM public.rooms WHERE building_id = v_tmp;
    DELETE FROM public.floors WHERE building_id = v_tmp;
    DELETE FROM public.buildings WHERE id = v_tmp;
  END LOOP;

  -- Ensure a default room type exists (fallback if none)
  SELECT id INTO v_rt FROM public.room_types ORDER BY display_order NULLS LAST, name LIMIT 1;
  IF v_rt IS NULL THEN
    INSERT INTO public.room_types (name, name_ar, base_price, max_guests)
    VALUES ('Standard', 'قياسي', 300, 2)
    RETURNING id INTO v_rt;
  END IF;

  -- Ensure buildings
  SELECT id INTO v_new_building FROM public.buildings WHERE name = 'المبنى الجديد' LIMIT 1;
  IF v_new_building IS NULL THEN
    INSERT INTO public.buildings (name) VALUES ('المبنى الجديد') RETURNING id INTO v_new_building;
  END IF;

  SELECT id INTO v_old_building FROM public.buildings WHERE name = 'المبنى القديم' LIMIT 1;
  IF v_old_building IS NULL THEN
    INSERT INTO public.buildings (name) VALUES ('المبنى القديم') RETURNING id INTO v_old_building;
  END IF;

  -- Ensure floors for new building (1/2/3)
  SELECT id INTO v_new_f1 FROM public.floors WHERE building_id = v_new_building AND (name = 'الطابق الأول' OR floor_number = 1 OR number = 1) LIMIT 1;
  IF v_new_f1 IS NULL THEN
    INSERT INTO public.floors (building_id, name, floor_number) VALUES (v_new_building, 'الطابق الأول', 1) RETURNING id INTO v_new_f1;
  END IF;

  SELECT id INTO v_new_f2 FROM public.floors WHERE building_id = v_new_building AND (name = 'الطابق الثاني' OR floor_number = 2 OR number = 2) LIMIT 1;
  IF v_new_f2 IS NULL THEN
    INSERT INTO public.floors (building_id, name, floor_number) VALUES (v_new_building, 'الطابق الثاني', 2) RETURNING id INTO v_new_f2;
  END IF;

  SELECT id INTO v_new_f3 FROM public.floors WHERE building_id = v_new_building AND (name = 'الطابق الثالث' OR floor_number = 3 OR number = 3) LIMIT 1;
  IF v_new_f3 IS NULL THEN
    INSERT INTO public.floors (building_id, name, floor_number) VALUES (v_new_building, 'الطابق الثالث', 3) RETURNING id INTO v_new_f3;
  END IF;

  -- Ensure floors for old building (1/2)
  SELECT id INTO v_old_f1 FROM public.floors WHERE building_id = v_old_building AND (name = 'الطابق الأول' OR floor_number = 1 OR number = 1) LIMIT 1;
  IF v_old_f1 IS NULL THEN
    INSERT INTO public.floors (building_id, name, floor_number) VALUES (v_old_building, 'الطابق الأول', 1) RETURNING id INTO v_old_f1;
  END IF;

  SELECT id INTO v_old_f2 FROM public.floors WHERE building_id = v_old_building AND (name = 'الطابق الثاني' OR floor_number = 2 OR number = 2) LIMIT 1;
  IF v_old_f2 IS NULL THEN
    INSERT INTO public.floors (building_id, name, floor_number) VALUES (v_old_building, 'الطابق الثاني', 2) RETURNING id INTO v_old_f2;
  END IF;

  -- NEW building: 6 rooms on floor 1, 7 on floor 2, 7 on floor 3
  FOR i IN 1..6 LOOP
    IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE room_code = CONCAT('NEW-1-', LPAD(i::text, 2, '0'))) THEN
      INSERT INTO public.rooms (building_id, floor_id, room_type_id, room_code, room_number, status, cleanliness)
      VALUES (v_new_building, v_new_f1, v_rt, CONCAT('NEW-1-', LPAD(i::text, 2, '0')), CONCAT('1', LPAD(i::text, 2, '0')), 'available', 'clean');
    END IF;
  END LOOP;

  FOR i IN 1..7 LOOP
    IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE room_code = CONCAT('NEW-2-', LPAD(i::text, 2, '0'))) THEN
      INSERT INTO public.rooms (building_id, floor_id, room_type_id, room_code, room_number, status, cleanliness)
      VALUES (v_new_building, v_new_f2, v_rt, CONCAT('NEW-2-', LPAD(i::text, 2, '0')), CONCAT('2', LPAD(i::text, 2, '0')), 'available', 'clean');
    END IF;
  END LOOP;

  FOR i IN 1..7 LOOP
    IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE room_code = CONCAT('NEW-3-', LPAD(i::text, 2, '0'))) THEN
      INSERT INTO public.rooms (building_id, floor_id, room_type_id, room_code, room_number, status, cleanliness)
      VALUES (v_new_building, v_new_f3, v_rt, CONCAT('NEW-3-', LPAD(i::text, 2, '0')), CONCAT('3', LPAD(i::text, 2, '0')), 'available', 'clean');
    END IF;
  END LOOP;

  -- OLD building: 4 rooms on floor 1, 3 on floor 2
  FOR i IN 1..4 LOOP
    IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE room_code = CONCAT('OLD-1-', LPAD(i::text, 2, '0'))) THEN
      INSERT INTO public.rooms (building_id, floor_id, room_type_id, room_code, room_number, status, cleanliness)
      VALUES (v_old_building, v_old_f1, v_rt, CONCAT('OLD-1-', LPAD(i::text, 2, '0')), CONCAT('1', LPAD(i::text, 2, '0')), 'available', 'clean');
    END IF;
  END LOOP;

  FOR i IN 1..3 LOOP
    IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE room_code = CONCAT('OLD-2-', LPAD(i::text, 2, '0'))) THEN
      INSERT INTO public.rooms (building_id, floor_id, room_type_id, room_code, room_number, status, cleanliness)
      VALUES (v_old_building, v_old_f2, v_rt, CONCAT('OLD-2-', LPAD(i::text, 2, '0')), CONCAT('2', LPAD(i::text, 2, '0')), 'available', 'clean');
    END IF;
  END LOOP;
END;
$$;
