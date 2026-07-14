CREATE TABLE IF NOT EXISTS public.gene_appointments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    medical_record_number TEXT NOT NULL,
    registered_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Setup RLS
ALTER TABLE public.gene_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all authenticated users" ON public.gene_appointments
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON public.gene_appointments
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON public.gene_appointments
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON public.gene_appointments
    FOR DELETE USING (auth.role() = 'authenticated');
