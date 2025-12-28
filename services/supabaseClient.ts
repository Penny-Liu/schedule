
// This file is used to configure the Supabase connection.
// To connect to Supabase:
// 1. Create a project at https://supabase.com
// 2. Get your 'Project URL' and 'Anon Key' from the API settings.
// 3. Create a .env.local file in the root of your project.
// 4. Add the following variables:
//    REACT_APP_SUPABASE_URL=your_project_url
//    REACT_APP_SUPABASE_ANON_KEY=your_anon_key

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

// Create a single supabase client for interacting with your database
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* 
  NOTE: To migrate from the current 'store.ts' (LocalStorage) to Supabase:
  1. You would rewrite 'store.ts' methods (getUsers, getShifts, etc.) to call 
     'supabase.from("table_name").select("*")' instead of reading from 'this.users'.
  2. Data operations would become asynchronous (async/await).
*/
