import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://mkjclbhwjnprrqtejmfa.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ramNsYmh3am5wcnJxdGVqbWZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTUzOTcsImV4cCI6MjA5NDE3MTM5N30.8lF66ixFoS9vdGFH-M-XplDrsNIyEO6X7vIA9cyJynI"

export const supabase = createClient(
SUPABASE_URL,
SUPABASE_KEY
);

