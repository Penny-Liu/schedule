export const HM_LOAD_ALGORITHM:string;
export const HM_SLOT_MINUTES:number;
export const HM_STAFF_SLOTS:number;
export const HM_LOAD_RULES:{key:string;label:string;slots:number;names:string[]}[];
export function classifyHealthMgmtOrder(record:{CheckupName__c?:string;ProcessType__c?:string;ResourceCategory__c?:string}):{kind:'flow'|'mapped'|'unmapped'|'outside';key:string|null};
export function healthMgmtDemandSlots(counts:Record<string,number>):number;
