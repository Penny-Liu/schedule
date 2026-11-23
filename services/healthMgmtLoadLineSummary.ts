import {HM_LOAD_RULES,hasCurrentHealthMgmtCounts} from './healthMgmtLoadRules.mjs';
import {calculateHealthMgmtLoad,normalizeHealthMgmtReportOrders,type HMLoadSnapshot,type calculateHealthMgmtCapacity} from './healthMgmtLoad';
export function healthMgmtPendingQuestion(name:string){
 return '是否納入 H／HA 工作？若納入，請提供每位標準分鐘';
}
export interface HMCampusLineInput {location:string;synced:boolean;snapshot?:HMLoadSnapshot;capacity:ReturnType<typeof calculateHealthMgmtCapacity>;}
const num=(value:number)=>Number.isInteger(value)?String(value):value.toFixed(1);
export function formatHealthMgmtSlotLineSummary(date:string,campuses:HMCampusLineInput[]){
 campuses=campuses.map(c=>({...c,snapshot:c.snapshot?normalizeHealthMgmtReportOrders(c.snapshot):undefined,synced:c.synced&&hasCurrentHealthMgmtCounts(c.snapshot?.counts)}));
 const lines=['健管 Slot 計算（H／HA）',`日期：${date}`,'1 slot＝10 分鐘；1 人＝30 slot'];
 for(const campus of campuses){
  const load=calculateHealthMgmtLoad(campus.snapshot,campus.synced,campus.capacity);
  lines.push('',`【${campus.location}】`);
  if(!campus.synced){lines.push('需求 S：尚未同步，不能視為零');}
  else{
   for(const rule of HM_LOAD_RULES){const count=campus.snapshot?.counts[rule.key]||0;lines.push(`${rule.label}：${count}組 × ${num(rule.slots)}＝${num(count*rule.slots)} slot`);}
   lines.push(`需求 S 合計：${num(load.demand!)} slot（${num(load.demand!*10)}分鐘）`);
  }
  lines.push(`人力 T：${load.staffCount}人 × 30＝${load.supplySlots} slot${load.unknownCapacity?'（人力待確認）':''}`);
  if(campus.synced)lines.push(load.rate===null?`負載：${load.status}`:`負載 S／T：${num(load.demand!)}／${load.supplySlots}＝${load.rate.toFixed(1)}%${load.unresolved||load.unknownCapacity?'（待確認）':''}`);
  const pending=campus.snapshot?.items.filter(item=>item.kind==='unmapped')||[];
  if(campus.synced&&pending.length){lines.push('待確認醫令（以下筆數為醫令筆數，尚未計入 S）：');for(const item of pending)lines.push(`・${item.name} ${item.order_count}筆：${healthMgmtPendingQuestion(item.name)}`);}
  if(campus.synced&&(campus.snapshot?.missing_identity_count||campus.snapshot?.fallback_identity_count))lines.push(`同步來源需管理者核對：缺客戶識別 ${campus.snapshot?.missing_identity_count||0}筆；以預約代替客戶 ${campus.snapshot?.fallback_identity_count||0}筆`);
  const reports=campus.snapshot?.items.filter(item=>item.kind==='report')||[];
  if(campus.synced&&reports.length)lines.push('報告用醫令（不計 Slot）：'+reports.map(item=>`${item.name} ${item.order_count}筆`).join('、'));
  if(load.excluded.length)lines.push('未計入 T：'+load.excluded.map(s=>`${s.name}（${s.reason}）`).join('、'));
 }
 lines.push('','檢備及基礎 A：同客戶／日期／院區多醫令合併一組。','H／HA 與 H支援去重；主控、行政、場控排除，輔控計入。');
 if(campuses.some(c=>c.synced&&Boolean(c.snapshot&&(c.snapshot.unmapped_count||c.snapshot.missing_identity_count||c.snapshot.fallback_identity_count))))lines.push('未計入的待確認項目可能使需求低估，請勿直接據此判定人力充足。');
 return lines.join('\n');
}
