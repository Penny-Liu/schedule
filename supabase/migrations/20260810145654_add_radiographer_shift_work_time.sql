-- Allow the daily radiographer view to store an optional working-hours label.
-- Safe to re-run: existing schedule rows and values are left unchanged.
alter table public.shifts
add column if not exists work_time text;

comment on column public.shifts.work_time is
'Daily radiographer working hours in HH:MM-HH:MM display format.';
