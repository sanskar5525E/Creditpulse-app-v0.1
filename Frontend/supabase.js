import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "SUPABASE_URL"
const SUPABASE_KEY = "SUPABASE_KEY"

export const supabase = createClient(
SUPABASE_URL,
SUPABASE_KEY
);

