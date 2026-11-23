alter table public.leaves add column pre_leave_priority integer;
alter table public.leaves add constraint leaves_pre_leave_priority_check
 check (pre_leave_priority is null or (pre_leave_priority between 1 and 999 and type='預假' and "startDate"="endDate"));
create unique index leaves_pre_leave_priority_per_day on public.leaves("startDate",pre_leave_priority)
 where type='預假' and status<>'已駁回' and pre_leave_priority is not null;

create function public.guard_pre_leave_priority() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if NEW.pre_leave_priority is null then return NEW; end if;
 elsif NEW.pre_leave_priority is not distinct from OLD.pre_leave_priority
   and (NEW.pre_leave_priority is null or (NEW."userId"=OLD."userId" and NEW.type=OLD.type and NEW."startDate"=OLD."startDate" and NEW."endDate"=OLD."endDate")) then
  return NEW;
 end if;
 if not exists(select 1 from public.users u where u.auth_user_id=(select auth.uid())
   and u.role in ('SUPERVISOR','SYSTEM_ADMIN') and coalesce(u.is_active,u."isActive",true)) then
  raise exception '只有放射師主管或系統管理員可設定優先休順序' using errcode='42501';
 end if;
 if NEW.pre_leave_priority is not null then
  if NEW.type<>'預假' or NEW."startDate"<>NEW."endDate" or NEW.status='已駁回' then
   raise exception '僅能設定放射師單日預假的優先休順序';
  end if;
  if not exists(select 1 from public.users u where u.id=NEW."userId" and
    (u.role in ('SUPERVISOR','RADIOGRAPHER_STAFF','RADIOGRAPHER_ASSISTANT')
     or coalesce((to_jsonb(u)->>'is_radiographer')::boolean,(to_jsonb(u)->>'isRadiographer')::boolean,false))) then
   raise exception '僅能設定放射師預假的優先休順序';
  end if;
 end if;
 return NEW;
end $$;
revoke all on function public.guard_pre_leave_priority() from public,anon,authenticated;
create trigger guard_pre_leave_priority before insert or update on public.leaves
 for each row execute function public.guard_pre_leave_priority();
