
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// SUBSTITUA pelos dados do seu projeto:
const SUPABASE_URL = "https://mxnvrxqwokvelulzdvmn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14bnZyeHF3b2t2ZWx1bHpkdm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NTQ4MjAsImV4cCI6MjA3MDQzMDgyMH0.DBntQQc91IWYAvMxHknJxjxxFAl5kiWOkc1LUXe_vKE";
// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
