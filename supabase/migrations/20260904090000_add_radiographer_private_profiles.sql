create table if not exists public.radiographer_private_profiles (
  user_id text primary key references public.users(id) on update cascade on delete cascade,
  birth_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (birth_date >= date '1900-01-01' and birth_date <= current_date)
);

comment on table public.radiographer_private_profiles is
  'Sensitive radiographer profile data kept separate from the legacy users table.';
comment on column public.radiographer_private_profiles.birth_date is
  'Used to calculate age at the end of a workload report period; never exported directly.';

alter table public.radiographer_private_profiles enable row level security;

revoke all privileges on table public.radiographer_private_profiles from anon;
grant select, insert, update, delete on table public.radiographer_private_profiles to authenticated;

create policy "Subjects and supervisors can view private profiles"
  on public.radiographer_private_profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.users app_user
      where app_user.auth_user_id = (select auth.uid())
        and (
          app_user.id = user_id
          or app_user.role in ('SUPERVISOR', 'SYSTEM_ADMIN')
        )
    )
  );

create policy "Supervisors can create private profiles"
  on public.radiographer_private_profiles for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users app_user
      where app_user.auth_user_id = (select auth.uid())
        and app_user.role in ('SUPERVISOR', 'SYSTEM_ADMIN')
    )
  );

create policy "Supervisors can update private profiles"
  on public.radiographer_private_profiles for update
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

create policy "Supervisors can delete private profiles"
  on public.radiographer_private_profiles for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users app_user
      where app_user.auth_user_id = (select auth.uid())
        and app_user.role in ('SUPERVISOR', 'SYSTEM_ADMIN')
    )
  );
