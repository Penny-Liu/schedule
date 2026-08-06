/// <reference types="vite/client" />

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check the deployment environment.');
}

const getLegacyJwtRole = (key: string): string | undefined => {
  try {
    const payload = key.split('.')[1];
    if (!payload) return undefined;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(atob(padded)).role;
  } catch {
    return undefined;
  }
};

if (
  supabaseAnonKey.startsWith('sb_secret_') ||
  getLegacyJwtRole(supabaseAnonKey) === 'service_role'
) {
  throw new Error('A Supabase secret key must never be used in browser code. Use a publishable or legacy anon key.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
