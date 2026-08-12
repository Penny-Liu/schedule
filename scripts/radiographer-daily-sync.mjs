export const NON_SYNCHRONIZED_DAILY_WORKLOAD_FIELDS = [
  "id",
  "tsmc_report",
  "total",
  "last_updated",
];

/**
 * Remove fields that must only be changed through manual entry before a
 * Salesforce synchronization payload is sent to Supabase.
 */
export const omitManualDailyWorkloadFields = (workload) => {
  const synchronizedWorkload = { ...workload };
  NON_SYNCHRONIZED_DAILY_WORKLOAD_FIELDS.forEach((field) => {
    delete synchronizedWorkload[field];
  });
  return synchronizedWorkload;
};
