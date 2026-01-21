-- Indexes to improve query performance on rooms-related fields
-- Run these in Supabase SQL editor

CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms (status);
CREATE INDEX IF NOT EXISTS idx_rooms_cleanliness ON public.rooms (cleanliness);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type_id ON public.rooms (room_type_id);
CREATE INDEX IF NOT EXISTS idx_rooms_building_id ON public.rooms (building_id);
CREATE INDEX IF NOT EXISTS idx_rooms_floor_id ON public.rooms (floor_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_number ON public.rooms (room_number);

-- Optional: if you often search room_code and description
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON public.rooms (room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_description_gin ON public.rooms USING gin (to_tsvector('simple', coalesce(description, '')));
