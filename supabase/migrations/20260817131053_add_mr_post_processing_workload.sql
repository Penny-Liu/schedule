alter table if exists public.radiographer_daily_workload
  add column if not exists mr_post_processing double precision default 0;

comment on column public.radiographer_daily_workload.mr_post_processing is
  'MR post-processing workload, classified from Salesforce ResourceCategory__c = MR';

alter table if exists public.radiographer_workload
  add column if not exists mr_post_processing integer default 0;

comment on column public.radiographer_workload.mr_post_processing is
  'MR post-processing workload, classified from Salesforce ResourceCategory__c = MR';
