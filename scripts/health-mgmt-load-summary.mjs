import {HM_LOAD_RULES,HM_LOAD_ALGORITHM,classifyHealthMgmtOrder} from '../services/healthMgmtLoadRules.mjs';
export function buildHealthMgmtLoadSnapshots(records,capturedAt=new Date().toISOString()) {
 const groups=new Map(),seen=new Set();
 for(const record of records){
  if(record.Checkup_Status__c!=='10'||!record.CheckStartDate__c)continue;
  if(!record.Id||seen.has(record.Id))continue;seen.add(record.Id);
  const location=['北投','大直'].includes(String(record.Location__c||'').trim())?String(record.Location__c).trim():'未辨識';
  const key=JSON.stringify([record.CheckStartDate__c,location]);
  if(!groups.has(key))groups.set(key,{date:record.CheckStartDate__c,location,people:new Set(),sets:Object.fromEntries(HM_LOAD_RULES.map(r=>[r.key,new Set()])),items:new Map(),source_count:0,missing_identity_count:0,fallback_identity_count:0,unmapped_count:0});
  const g=groups.get(key);g.source_count++;
  const classification=classifyHealthMgmtOrder(record);
  if(classification.kind==='flow'||classification.kind==='outside')continue;
  const itemKey=JSON.stringify([record.CheckupName__c||'未填醫令',record.ResourceCategory__c||'未分類',classification.kind,classification.key]);
  const item=g.items.get(itemKey)||{name:record.CheckupName__c||'未填醫令',category:record.ResourceCategory__c||'未分類',kind:classification.kind,key:classification.key,order_count:0};item.order_count++;g.items.set(itemKey,item);
  if(classification.kind==='unmapped'){g.unmapped_count++;continue;}
  // Same customer/date/campus: each bucket once, regardless of medical-order count.
  const contact=record.Order__r?.Contact__c;
  const identity=contact?`contact:${contact}`:record.Order__c?`order:${record.Order__c}`:null;
  if(!identity){g.missing_identity_count++;continue;}
  if(!contact)g.fallback_identity_count++;
  g.people.add(identity);g.sets[classification.key].add(identity);
 }
 return [...groups.values()].map(g=>({exam_date:g.date,location:g.location,counts:Object.fromEntries(HM_LOAD_RULES.map(r=>[r.key,g.sets[r.key].size])),customer_count:g.people.size,source_count:g.source_count,unmapped_count:g.unmapped_count,missing_identity_count:g.missing_identity_count,fallback_identity_count:g.fallback_identity_count,items:[...g.items.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')),algorithm:HM_LOAD_ALGORITHM,synced_at:capturedAt}));
}

export function completeHealthMgmtLoadDays(snapshots,days,capturedAt) {
 const rows=[...snapshots];
 for(const exam_date of days)for(const location of ['北投','大直'])if(!rows.some(r=>r.exam_date===exam_date&&r.location===location))rows.push({exam_date,location,counts:Object.fromEntries(HM_LOAD_RULES.map(r=>[r.key,0])),customer_count:0,source_count:0,unmapped_count:0,missing_identity_count:0,fallback_identity_count:0,items:[],algorithm:HM_LOAD_ALGORITHM,synced_at:capturedAt});
 return rows;
}
