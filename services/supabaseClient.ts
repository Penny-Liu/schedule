/// <reference types="vite/client" />

import { createClient } from '@supabase/supabase-js';

// Fallback to empty string to prevent crash, but logs warning
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Key is missing. Please check your .env file.');
} else {
  console.log('[Supabase] Initializing client with URL:', supabaseUrl ? supabaseUrl.substring(0, 15) + '...' : 'Unknown');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);
