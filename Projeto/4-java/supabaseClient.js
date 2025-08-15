// Projeto/4-java/supabaseClient.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// (API)
const SUPABASE_URL  = "https://www.portalaltitude.com.br/Projeto//1-html/index.html";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14bnZyeHF3b2t2ZWx1bHpkdm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NTQ4MjAsImV4cCI6MjA3MDQzMDgyMH0.DBntQQc91IWYAvMxHknJxjxxFAl5kiWOkc1LUXe_vKE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
