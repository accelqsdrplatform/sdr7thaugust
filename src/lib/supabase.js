import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mvqtfkckffnvazzicrqx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cXRma2NrZmZudmF6emljcnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0OTQ4NjIsImV4cCI6MjExMDA3MDg2Mn0.O9oLhHll6nYIH4j91BNCOABCGfqc2lBpMvlaYO3GFsU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
