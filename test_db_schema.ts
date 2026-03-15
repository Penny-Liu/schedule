import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sfeyvjeiqgvnketbcujm.supabase.co';
const supabaseKey = 'sb_publishable_LubB60pKdYRP_pU-Bpoc-g_3OyY59Oo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const validUuid = '12345678-1234-1234-1234-123456789012';
    const { data, error } = await supabase.from('health_mgmt_shifts').insert([
        { id: validUuid, userId: validUuid, date: '2026-03-12', station: 'test' }
    ]).select('*');
    console.log("Data:", data);
    console.log("Error:", error);
    await supabase.from('health_mgmt_shifts').delete().eq('id', validUuid);
}

test();
