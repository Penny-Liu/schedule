// Only the current order's explicit Care option is used, never historical contact notes.
export function hasClaustrophobiaCare(record) {
 return record._claustrophobiaCare===true || String(record.Order__r?.Care__c||'').split(';').some(value=>value.trim()==='幽閉');
}
