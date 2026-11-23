export const HM_SYNC_FORWARD_DAYS=14;
export function defaultHealthMgmtSyncRange(today){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today||'')||!Number.isFinite(Date.parse(today))||new Date(today).toISOString().slice(0,10)!==today)throw new Error('健管同步日期無效');
 return {from:today,to:new Date(Date.parse(today)+HM_SYNC_FORWARD_DAYS*86400000).toISOString().slice(0,10)};
}
