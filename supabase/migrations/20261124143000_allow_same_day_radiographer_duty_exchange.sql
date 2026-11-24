alter table public.leaves
 add column if not exists "targetRoleToSwap" text;

alter table public.leaves
 drop constraint if exists leaves_duty_exchange_fields_check;

alter table public.leaves
 add constraint leaves_duty_exchange_fields_check
 check (
  type<>'任務互換' or (
   "targetUserId" is not null and "targetUserId"<>"userId"
   and "returnDate" is not null
   and "roleToSwap" in ('開機','晚班','輔班','排班')
   and "targetRoleToSwap" in ('開機','晚班','輔班','排班')
  )
 );

create or replace function public.approve_radiographer_duty_exchange(p_leave_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare
 v_leave public.leaves%rowtype;
 v_actor public.users%rowtype;
 v_requestor_start public.shifts%rowtype;
 v_target_start public.shifts%rowtype;
 v_requestor_return public.shifts%rowtype;
 v_target_return public.shifts%rowtype;
 v_requestor_user jsonb;
 v_target_user jsonb;
 v_pause jsonb;
 v_pause_start text;
 v_pause_end text;
 v_requestor_roles_after_exchange text[];
 v_target_roles_after_exchange text[];
 v_updated_rows integer;
begin
 select * into v_actor from public.users u
  where u.auth_user_id=(select auth.uid())
   and u.role in ('SUPERVISOR','SYSTEM_ADMIN')
   and coalesce(u.is_active,u."isActive",true)
  limit 1;
 if not found then raise exception '只有放射師主管或系統管理員可核准任務互換' using errcode='42501';end if;

 select * into v_leave from public.leaves where id::text=p_leave_id for update;
 if not found or v_leave.type is distinct from '任務互換' then raise exception '找不到任務互換申請';end if;
 if v_leave.status is distinct from '待審核' or v_leave."targetApproval" is distinct from 'AGREED' then raise exception '任務互換尚未完成對方同意';end if;
 if v_leave."targetUserId" is null or v_leave."targetUserId"=v_leave."userId" then raise exception '任務互換對象無效';end if;
 if v_leave."returnDate" is null then raise exception '任務互換日期無效';end if;
 if not coalesce(v_leave."roleToSwap" in ('開機','晚班','輔班','排班'),false)
  or not coalesce(v_leave."targetRoleToSwap" in ('開機','晚班','輔班','排班'),false) then raise exception '任務互換類型無效';end if;

 select * into v_requestor_start from public.shifts
  where "userId"=v_leave."userId" and date=v_leave."startDate" for update;
 if not found then raise exception '申請人在第一個日期沒有排班';end if;
 select * into v_target_start from public.shifts
  where "userId"=v_leave."targetUserId" and date=v_leave."startDate" for update;
 if not found then raise exception '互換對象在第一個日期沒有排班';end if;
 select * into v_requestor_return from public.shifts
  where "userId"=v_leave."userId" and date=v_leave."returnDate" for update;
 if not found then raise exception '申請人在第二個日期沒有排班';end if;
 select * into v_target_return from public.shifts
  where "userId"=v_leave."targetUserId" and date=v_leave."returnDate" for update;
 if not found then raise exception '互換對象在第二個日期沒有排班';end if;

 if v_requestor_start.station in ('休假','OFF','SYSTEM_OFF')
  or v_target_start.station in ('休假','OFF','SYSTEM_OFF')
  or v_requestor_return.station in ('休假','OFF','SYSTEM_OFF')
  or v_target_return.station in ('休假','OFF','SYSTEM_OFF') then
  raise exception '雙方在兩個日期都必須是上班狀態';
 end if;
 if not (v_leave."roleToSwap"=any(coalesce(v_requestor_start."specialRoles",array[]::text[])))
  or not (v_leave."targetRoleToSwap"=any(coalesce(v_target_return."specialRoles",array[]::text[]))) then
  raise exception '原任務已變更，請重新確認後再送出互換申請';
 end if;

 select to_jsonb(u) into v_requestor_user from public.users u where u.id=v_leave."userId";
 if not found then raise exception '找不到申請人資料';end if;
 select to_jsonb(u) into v_target_user from public.users u where u.id=v_leave."targetUserId";
 if not found then raise exception '找不到互換對象資料';end if;

 if not coalesce((v_requestor_user->>'is_active')::boolean,(v_requestor_user->>'isActive')::boolean,true)
  or not coalesce((v_requestor_user->>'is_radiographer')::boolean,(v_requestor_user->>'isRadiographer')::boolean,false)
  or not (coalesce(v_requestor_user->'capabilities','[]'::jsonb) ? v_leave."targetRoleToSwap")
  or not coalesce((v_target_user->>'is_active')::boolean,(v_target_user->>'isActive')::boolean,true)
  or not coalesce((v_target_user->>'is_radiographer')::boolean,(v_target_user->>'isRadiographer')::boolean,false)
  or v_target_user->>'role'='RADIOGRAPHER_ASSISTANT'
  or not (coalesce(v_target_user->'capabilities','[]'::jsonb) ? v_leave."roleToSwap") then
  raise exception '互換對象或申請人已不具備任務資格';
 end if;
 if (coalesce(v_requestor_user->>'hire_date',v_requestor_user->>'hireDate') is not null
   and (v_leave."startDate"::text<coalesce(v_requestor_user->>'hire_date',v_requestor_user->>'hireDate')
     or v_leave."returnDate"::text<coalesce(v_requestor_user->>'hire_date',v_requestor_user->>'hireDate')))
  or (coalesce(v_requestor_user->>'resignation_date',v_requestor_user->>'resignationDate') is not null
   and (v_leave."startDate"::text>coalesce(v_requestor_user->>'resignation_date',v_requestor_user->>'resignationDate')
     or v_leave."returnDate"::text>coalesce(v_requestor_user->>'resignation_date',v_requestor_user->>'resignationDate')))
  or (coalesce(v_target_user->>'hire_date',v_target_user->>'hireDate') is not null
   and (v_leave."startDate"::text<coalesce(v_target_user->>'hire_date',v_target_user->>'hireDate')
     or v_leave."returnDate"::text<coalesce(v_target_user->>'hire_date',v_target_user->>'hireDate')))
  or (coalesce(v_target_user->>'resignation_date',v_target_user->>'resignationDate') is not null
   and (v_leave."startDate"::text>coalesce(v_target_user->>'resignation_date',v_target_user->>'resignationDate')
     or v_leave."returnDate"::text>coalesce(v_target_user->>'resignation_date',v_target_user->>'resignationDate'))) then
  raise exception '互換日期超出任一方的在職期間';
 end if;

 v_pause:=coalesce(v_requestor_user->'personal_cycles',v_requestor_user->'personalCycles','{}'::jsonb)->'__employment_pause__';
 v_pause_start:=coalesce(v_pause->>'startDate',v_pause->>'start_date');
 v_pause_end:=coalesce(v_pause->>'endDate',v_pause->>'end_date');
 if v_pause_start is not null and v_pause_end is not null
  and ((v_leave."startDate"::text between v_pause_start and v_pause_end)
    or (v_leave."returnDate"::text between v_pause_start and v_pause_end)) then
  raise exception '申請人在互換日期處於留職停薪期間';
 end if;
 v_pause:=coalesce(v_target_user->'personal_cycles',v_target_user->'personalCycles','{}'::jsonb)->'__employment_pause__';
 v_pause_start:=coalesce(v_pause->>'startDate',v_pause->>'start_date');
 v_pause_end:=coalesce(v_pause->>'endDate',v_pause->>'end_date');
 if v_pause_start is not null and v_pause_end is not null
  and ((v_leave."startDate"::text between v_pause_start and v_pause_end)
    or (v_leave."returnDate"::text between v_pause_start and v_pause_end)) then
  raise exception '互換對象在互換日期處於留職停薪期間';
 end if;

 if v_leave."startDate"=v_leave."returnDate" then
  v_target_roles_after_exchange:=array_remove(coalesce(v_target_start."specialRoles",array[]::text[]),v_leave."targetRoleToSwap");
  v_requestor_roles_after_exchange:=array_remove(coalesce(v_requestor_start."specialRoles",array[]::text[]),v_leave."roleToSwap");
 else
  v_target_roles_after_exchange:=coalesce(v_target_start."specialRoles",array[]::text[]);
  v_requestor_roles_after_exchange:=coalesce(v_requestor_return."specialRoles",array[]::text[]);
 end if;

 if (v_leave."roleToSwap"='開機'
   and array_remove(array_remove(v_target_roles_after_exchange,'輔班'),'配合銷假')<>'{}'::text[])
  or (v_leave."roleToSwap"='晚班'
   and array_remove(v_target_roles_after_exchange,'配合銷假')<>'{}'::text[])
  or (v_leave."roleToSwap"='輔班'
   and array_remove(array_remove(v_target_roles_after_exchange,'開機'),'配合銷假')<>'{}'::text[])
  or (v_leave."roleToSwap"='排班'
   and array_remove(v_target_roles_after_exchange,'配合銷假')<>'{}'::text[])
  or (v_leave."targetRoleToSwap"='開機'
   and array_remove(array_remove(v_requestor_roles_after_exchange,'輔班'),'配合銷假')<>'{}'::text[])
  or (v_leave."targetRoleToSwap"='晚班'
   and array_remove(v_requestor_roles_after_exchange,'配合銷假')<>'{}'::text[])
  or (v_leave."targetRoleToSwap"='輔班'
   and array_remove(array_remove(v_requestor_roles_after_exchange,'開機'),'配合銷假')<>'{}'::text[])
  or (v_leave."targetRoleToSwap"='排班'
   and array_remove(v_requestor_roles_after_exchange,'配合銷假')<>'{}'::text[]) then
  raise exception '交換後的特殊任務會與既有任務衝突';
 end if;
 if (v_leave."roleToSwap" in ('開機','晚班')
   and (v_target_start.station like '%場控%' or v_target_start.station like '%遠%' or v_target_start.station like '%大直%'))
  or (v_leave."targetRoleToSwap" in ('開機','晚班')
   and (v_requestor_return.station like '%場控%' or v_requestor_return.station like '%遠%' or v_requestor_return.station like '%大直%')) then
  raise exception '交換後的特殊任務與既有崗位衝突';
 end if;
 if v_leave."roleToSwap"=any(v_target_roles_after_exchange)
  or v_leave."targetRoleToSwap"=any(v_requestor_roles_after_exchange) then
  raise exception '互換後會造成重複任務';
 end if;

 update public.shifts set
  "specialRoles"=array_remove(coalesce("specialRoles",array[]::text[]),v_leave."roleToSwap"),
  "isRoleAutoGenerated"=false
  where id=v_requestor_start.id;
 get diagnostics v_updated_rows=row_count;
 if v_updated_rows<>1 then raise exception '無法更新申請人的第一個日期排班';end if;
 update public.shifts set
  "specialRoles"=coalesce("specialRoles",array[]::text[])||array[v_leave."roleToSwap"],
  "isRoleAutoGenerated"=false
  where id=v_target_start.id;
 get diagnostics v_updated_rows=row_count;
 if v_updated_rows<>1 then raise exception '無法更新互換對象的第一個日期排班';end if;
 update public.shifts set
  "specialRoles"=array_remove(coalesce("specialRoles",array[]::text[]),v_leave."targetRoleToSwap"),
  "isRoleAutoGenerated"=false
  where id=v_target_return.id;
 get diagnostics v_updated_rows=row_count;
 if v_updated_rows<>1 then raise exception '無法更新互換對象的第二個日期排班';end if;
 update public.shifts set
  "specialRoles"=coalesce("specialRoles",array[]::text[])||array[v_leave."targetRoleToSwap"],
  "isRoleAutoGenerated"=false
  where id=v_requestor_return.id;
 get diagnostics v_updated_rows=row_count;
 if v_updated_rows<>1 then raise exception '無法更新申請人的第二個日期排班';end if;

 update public.leaves set status='已核准',"approverId"=v_actor.id,"processedAt"=now()
  where id::text=p_leave_id;
 get diagnostics v_updated_rows=row_count;
 if v_updated_rows<>1 then raise exception '無法更新任務互換申請狀態';end if;
end $$;

revoke all on function public.approve_radiographer_duty_exchange(text) from public,anon;
grant execute on function public.approve_radiographer_duty_exchange(text) to authenticated;
