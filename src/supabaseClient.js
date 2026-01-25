import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://swsrtxzzwqykwcbbdann.supabase.co';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3c3J0eHp6d3F5a3djYmJkYW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5ODk4NTMsImV4cCI6MjA4MzU2NTg1M30.tIWQg7hjphXJImqq9ZzNGFQyuDOdhN5GpGSmaiQlxSw';
export const supabase = createClient(supabaseUrl, supabaseKey);