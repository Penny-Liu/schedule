create or replace function public.requesting_app_user_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.jwt() -> 'app_metadata' ->> 'legacy_user_id'
$$;

create or replace function public.requesting_app_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.jwt() -> 'app_metadata' ->> 'app_role'
$$;

revoke all on function public.requesting_app_user_id() from public, anon;
revoke all on function public.requesting_app_role() from public, anon;
grant execute on function public.requesting_app_user_id() to authenticated;
grant execute on function public.requesting_app_role() to authenticated;

drop policy if exists "Subjects and supervisors can view private profiles"
  on public.radiographer_private_profiles;
drop policy if exists "Supervisors can create private profiles"
  on public.radiographer_private_profiles;
drop policy if exists "Supervisors can update private profiles"
  on public.radiographer_private_profiles;
drop policy if exists "Supervisors can delete private profiles"
  on public.radiographer_private_profiles;

create policy "Subjects and supervisors can view private profiles"
  on public.radiographer_private_profiles for select to authenticated
  using (
    user_id = (select public.requesting_app_user_id())
    or (select public.requesting_app_role()) in ('SUPERVISOR', 'SYSTEM_ADMIN')
  );

create policy "Supervisors can create private profiles"
  on public.radiographer_private_profiles for insert to authenticated
  with check (
    (select public.requesting_app_role()) in ('SUPERVISOR', 'SYSTEM_ADMIN')
  );

create policy "Supervisors can update private profiles"
  on public.radiographer_private_profiles for update to authenticated
  using ((select public.requesting_app_role()) in ('SUPERVISOR', 'SYSTEM_ADMIN'))
  with check ((select public.requesting_app_role()) in ('SUPERVISOR', 'SYSTEM_ADMIN'));

create policy "Supervisors can delete private profiles"
  on public.radiographer_private_profiles for delete to authenticated
  using ((select public.requesting_app_role()) in ('SUPERVISOR', 'SYSTEM_ADMIN'));
