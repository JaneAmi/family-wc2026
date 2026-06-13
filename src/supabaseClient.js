import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// When the keys aren't set yet the app still renders, showing a setup notice
// instead of crashing.
export const supabaseReady = Boolean(url && key);
export const supabase = supabaseReady ? createClient(url, key) : null;

// Exposed so the "Sync results now" button can call the Supabase Edge Function
// directly (works on any host: GitHub Pages, Vercel, a static host, ...).
export const supabaseUrl = url;
export const supabaseAnonKey = key;
