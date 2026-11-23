create or replace function public.can_access_health_mgmt_cycle(p_campus text,p_edit boolean default false)
returns boolean language sql stable security invoker set search_path='' as $$
 select (select auth.role())='service_role'
  or (p_campus in ('北投','大直') and exists(
   select 1 from public.users u where u.auth_user_id=(select auth.uid()) and coalesce(u.is_active,u."isActive",true)
   and (u.role='SYSTEM_ADMIN' or ((u.role in ('HM_SUPERVISOR','HM_STAFF') or 'health_mgmt_view'=any(u.permissions))
    and (not p_edit or 'health_mgmt_edit'=any(u.permissions))
    and coalesce(nullif(u.health_mgmt_location,''),'全部') in ('全部',p_campus)))
  ));
$$;
