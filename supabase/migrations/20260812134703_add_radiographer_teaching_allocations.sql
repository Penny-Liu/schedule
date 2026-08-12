alter table public.users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists users_auth_user_id_key
  on public.users (auth_user_id)
  where auth_user_id is not null;

create table if not exists public.radiographer_teaching_allocations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  student_user_id text not null references public.users(id) on update cascade on delete cascade,
  teacher_user_id text not null references public.users(id) on update cascade on delete restrict,
  workload_field text not null,
  amount double precision not null,
  created_by text references public.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint radiographer_teaching_allocations_positive_amount check (amount > 0),
  constraint radiographer_teaching_allocations_different_people check (student_user_id <> teacher_user_id),
  constraint radiographer_teaching_allocations_supported_field check (
    workload_field in (
      'mr', 'mrLargeMale', 'mrLargeFemale', 'mrMedium', 'mrSmall',
      'us', 'usA', 'usBreast', 'usHeart', 'usThy', 'usCCA', 'usNeck',
      'usPelvisFemale', 'usPelvisMale', 'usFibrosis',
      'ct', 'cta', 'ctaPostProcessing', 'dx', 'mg', 'bmd'
    )
  ),
  constraint radiographer_teaching_allocations_unique_assignment
    unique (date, student_user_id, teacher_user_id, workload_field)
);

create index if not exists radiographer_teaching_allocations_student_date_idx
  on public.radiographer_teaching_allocations (student_user_id, date);

create index if not exists radiographer_teaching_allocations_teacher_date_idx
  on public.radiographer_teaching_allocations (teacher_user_id, date);

create index if not exists radiographer_teaching_allocations_created_by_idx
  on public.radiographer_teaching_allocations (created_by)
  where created_by is not null;

alter table public.radiographer_teaching_allocations enable row level security;

grant select on table public.radiographer_teaching_allocations to anon, authenticated;
grant insert, update, delete on table public.radiographer_teaching_allocations to authenticated;

create policy "Teaching allocations are viewable"
  on public.radiographer_teaching_allocations
  for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert teaching allocations"
  on public.radiographer_teaching_allocations
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users app_user
      where app_user.auth_user_id = (select auth.uid())
        and app_user.role in ('SUPERVISOR', 'SYSTEM_ADMIN')
    )
  );

create policy "Authenticated users can update teaching allocations"
  on public.radiographer_teaching_allocations
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users app_user
      where app_user.auth_user_id = (select auth.uid())
        and app_user.role in ('SUPERVISOR', 'SYSTEM_ADMIN')
    )
  )
  with check (
    exists (
      select 1
      from public.users app_user
      where app_user.auth_user_id = (select auth.uid())
        and app_user.role in ('SUPERVISOR', 'SYSTEM_ADMIN')
    )
  );

create policy "Authenticated users can delete teaching allocations"
  on public.radiographer_teaching_allocations
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users app_user
      where app_user.auth_user_id = (select auth.uid())
        and app_user.role in ('SUPERVISOR', 'SYSTEM_ADMIN')
    )
  );
