
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Manually parse .env since we are running as a script
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseAnonKey = envConfig.VITE_SUPABASE_ANON_KEY;

console.log('Testing connection with:');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseAnonKey ? supabaseAnonKey.substring(0, 10) + '...' : 'Missing');

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
    try {
        const { data, error } = await supabase.from('users').select('*').limit(1);
        if (error) {
            console.error('Connection Failed:', error);
        } else {
            console.log('Connection Successful!');
            console.log('Data:', data);
        }
    } catch (err) {
        console.error('Exception:', err);
    }
}

testConnection();
