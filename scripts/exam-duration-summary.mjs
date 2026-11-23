import {hasClaustrophobiaCare} from './exam-duration-care.mjs';
import { normalizeMrDurationSessions, mrDurationLabel } from './mr-duration-sessions.mjs';
import { getUsDurationSubtype, getUsDurationAllocation } from '../services/examDurationSubtype.mjs';
export const DURATION_CATEGORIES = ['MR', 'CT', 'US', 'BMD', 'MG', 'DX'];
export const MAX_DURATION_SECONDS = 4 * 60 * 60;
export const DURATION_ALGORITHM = 'actual-flow-v4';

// 不將多項醫令共用的區間拆成單項耗時；同項、同人、同室、同區間只取一次。
export function buildExamDurationSummaries(records, syncedAt = new Date().toISOString()) {
  const eligible = records.filter(r => DURATION_CATEGORIES.includes(r.ResourceCategory__c) && !String(r.CheckupName__c || '').includes('報到'));
  const intervals = new Map();
  for (const r of eligible) {
    if (!r.Order__c || !r.examination_StartTime1__c || !r.examination_EndTime1__c) continue;
    const key = JSON.stringify([r.CheckStartDate__c, r.Order__c, r.Resource__c, r.ResourceCategory__c, r.examination_StartTime1__c, r.examination_EndTime1__c]);
    const members = intervals.get(key) || [];
    members.push(r);
    intervals.set(key, members);
  }
  const groups = new Map();
  const seen = new Set();
  const ids = new Set();
  for (const r of eligible) {
    if (r.Id && ids.has(r.Id)) continue;
    if (r.Id) ids.add(r.Id);
    const base = {
      metric_scope: 'item',
      exam_date: r.CheckStartDate__c,
      radiographer_id: r.Radiologist__c || '',
      radiographer_name: r.Radiologist__r?.Name || '未填放射師',
      category: r.ResourceCategory__c,
      exam_name: r.CheckupName__c || '未填項目',
      location: r.Location__c || '未填院區',
      resource_name: r.Resource__r?.Name || '未填檢查室',
    };
    const key = JSON.stringify(Object.values(base));
    const g = groups.get(key) || { ...base, total_count: 0, valid_count: 0,
      missing_time_count: 0, invalid_time_count: 0, zero_count: 0, negative_count: 0,
      shared_interval_count: 0, duplicate_count: 0, outlier_count: 0, missing_staff_count: 0,
      claustrophobia_count: 0, duration_histogram: {}, algorithm: DURATION_ALGORITHM, synced_at: syncedAt };
    groups.set(key, g);
    g.total_count++;
    if (r.durationIssue === "shared") { g.shared_interval_count++; continue; }
    if (r.durationIssue === "outlier") { g.outlier_count++; continue; }
    const start = r.examination_StartTime1__c, end = r.examination_EndTime1__c;
    if (!start || !end) { g.missing_time_count++; continue; }
    const seconds = r.durationSecondsOverride ?? (Date.parse(end) - Date.parse(start)) / 1000;
    if (!Number.isFinite(seconds)) { g.invalid_time_count++; continue; }
    if (seconds === 0) { g.zero_count++; continue; }
    if (seconds < 0) { g.negative_count++; continue; }
    if (!r.Radiologist__c) { g.missing_staff_count++; continue; }
    const intervalKey = JSON.stringify([r.CheckStartDate__c, r.Order__c, r.Resource__c, r.ResourceCategory__c, start, end]);
    const members = r.Order__c ? intervals.get(intervalKey) || [] : [];
    const items = new Set(members.map(m => JSON.stringify([m.Checkup__c || m.CheckupName__c, m.Radiologist__c])));
    if (items.size > 1) { g.shared_interval_count++; continue; }
    if (seconds > MAX_DURATION_SECONDS) { g.outlier_count++; continue; }
    // 缺少同一檢查識別時不合併不同醫令。
    const uniqueKey = r.Order__c ? `${key}|${intervalKey}` : r.Id;
    if (uniqueKey && seen.has(uniqueKey)) { g.duplicate_count++; continue; }
    if (uniqueKey) seen.add(uniqueKey);
    g.valid_count++;
    if(r.ResourceCategory__c==='MR'&&!String(r.CheckupName__c||'').includes('後處理')&&hasClaustrophobiaCare(r))g.claustrophobia_count++;
    g.duration_histogram[seconds] = (g.duration_histogram[seconds] || 0) + 1;
  }
  return [...groups.values()];
}

const registration = r => /報到/.test(`${r.ProcessType__c || ''} ${r.CheckupName__c || ''}`);

// 主預約提供整次儀器流程時間；子項僅用於套別與執行者核對，不分攤主預約時間。
export function buildExamFlowSummaries(records, syncedAt = new Date().toISOString()) {
  const children = new Map();
  for (const r of records) {
    if (!r.CheckupReservationId__c || registration(r)) continue;
    const list = children.get(r.CheckupReservationId__c) || [];
    list.push(r); children.set(r.CheckupReservationId__c, list);
  }
  const sessions = [];
  for (const root of records) {
    if (!DURATION_CATEGORIES.includes(root.ResourceCategory__c) || !registration(root) || root.End__c === false) continue;
    const items = (children.get(root.Id) || []).filter(r => r.ResourceCategory__c === root.ResourceCategory__c);
    const people = new Map();
    for (const r of [root, ...items]) if (r.Radiologist__c) people.set(r.Radiologist__c, r.Radiologist__r?.Name || '未填放射師');
    const distinctItems = new Map(items.map(r => [r.Checkup__c || r.CheckupName__c, r.CheckupName__c]));
    const names = [...new Set([...distinctItems.values()].filter(Boolean))].sort();
    let label = names.length ? names.join('＋') : '明細未連結';
    if (root.ResourceCategory__c === 'MR' && distinctItems.size) {
      label = root._mrSessionLabel || mrDurationLabel(root,items);
    }
    const onlyPerson = people.size === 1 ? [...people.entries()][0] : null;
    sessions.push({ ...root, _claustrophobiaCare:[root,...items].some(hasClaustrophobiaCare),
      // 不同主預約是不同流程，即使同客戶、同儀器、同時間也不擅自合併。
      Order__c: root.Id, Checkup__c: label,
      CheckupName__c: `${root.ResourceCategory__c} 整次｜${label}`,
      Radiologist__c: onlyPerson?.[0] || null,
      Radiologist__r: { Name: onlyPerson?.[1] || (people.size > 1 ? '多人共同（未拆分）' : '未填放射師') },
    });
  }
  return buildExamDurationSummaries(sessions, syncedAt).map(row => ({ ...row, metric_scope: 'flow' }));
}

export function buildAllExamDurationSummaries(records, syncedAt = new Date().toISOString()) {
  const sessions=normalizeMrDurationSessions(records);
  return [...buildExamDurationSummaries(records.filter(r => r.End__c !== false && !registration(r)), syncedAt), ...buildExamFlowSummaries(sessions, syncedAt), ...buildSupplementalDurationSummaries(records, syncedAt), ...buildAllocatedExamDurationSummaries(sessions, syncedAt), ...buildAllocatedExamDurationSummaries(sessions, syncedAt, true), ...buildMrPlannedSummaries(sessions,syncedAt)];
}

export function buildMrPlannedSummaries(records,syncedAt) {
 const planned=records.map(r=>{
  if(r.ResourceCategory__c!=='MR'||!registration(r))return r;
  const plan=r._plannedDuration;
  const timestamp='2000-01-01T00:00:00Z';
  return {...r,examination_StartTime1__c:plan?.issue==='missing'?null:timestamp,
   examination_EndTime1__c:timestamp,durationSecondsOverride:plan?.issue==='invalid'?NaN:plan?.seconds,
   durationIssue:r.durationIssue==='shared'?'shared':plan?.issue==='outlier'?'outlier':undefined};
 });
 return buildExamFlowSummaries(planned,syncedAt).filter(r=>r.category==='MR').map(r=>({...r,metric_scope:'planned'}));
}


// 與工作量同步一致：後處理按同日／Order／人員／資源類別去重，CTA 依 CTAUseTime 非空判定。
export function buildSupplementalDurationSummaries(records, syncedAt = new Date().toISOString()) {
  const byId = new Map(records.map(r => [r.Id, r]));
  const postGroups = new Map();
  const ctaGroups = new Map();
  for (const r of records) {
    if (!['MR','CT'].includes(r.ResourceCategory__c) || !r.Order__c) continue;
    if (r.CTA_Further_Rad__c) {
      const key = JSON.stringify([r.CheckStartDate__c,r.Order__c,r.ResourceCategory__c,r.CTA_Further_Rad__c]);
      postGroups.set(key,[...(postGroups.get(key)||[]),r]);
    }
    if (r.ResourceCategory__c === 'CT' && r.CTAUseTime__c != null && r.Radiologist__c) {
      const key = JSON.stringify([r.CheckStartDate__c,r.Order__c,r.Radiologist__c]);
      ctaGroups.set(key,[...(ctaGroups.get(key)||[]),r]);
    }
  }
  const posts = [...postGroups.entries()].map(([key,list]) => {
    const withTimes=list.filter(r=>r.CTA_Further_StartTime__c && r.CTA_Further_EndTime__c);
    const intervals=new Set(withTimes.map(r=>JSON.stringify([r.CTA_Further_StartTime__c,r.CTA_Further_EndTime__c])));
    const r=withTimes[0]||list[0];
    return {...r,Id:`post:${key}`,Order__c:`post:${key}`,Checkup__c:`${r.ResourceCategory__c}後處理`,CheckupName__c:`${r.ResourceCategory__c}後處理`,
      Radiologist__c:r.CTA_Further_Rad__c,Radiologist__r:r.CTA_Further_Rad__r,
      examination_StartTime1__c:r.CTA_Further_StartTime__c,examination_EndTime1__c:r.CTA_Further_EndTime__c,
      durationIssue:intervals.size>1?'shared':undefined};
  });
  const ctas = [...ctaGroups.entries()].map(([key,list])=>{
    const r=list.find(r=>!r.CheckupReservationId__c)||list[0];
    const parent=byId.get(r.CheckupReservationId__c)||r;
    return {...r,Id:`cta:${key}`,Order__c:`cta:${key}`,Checkup__c:'CTA',CheckupName__c:'CTA',
      examination_StartTime1__c:parent.examination_StartTime1__c,examination_EndTime1__c:parent.examination_EndTime1__c,
      durationIssue:parent.Radiologist__c && parent.Radiologist__c!==r.Radiologist__c?'shared':undefined};
  });
  return [...buildExamDurationSummaries(posts,syncedAt),...buildExamDurationSummaries(ctas,syncedAt).map(row=>({...row,metric_scope:'flow'}))];
}

// 均攤為推估：每次流程總時間除以實際完成醫令數，保留原始流程與單項統計。
export function buildAllocatedExamDurationSummaries(records, syncedAt = new Date().toISOString(), sourceFlows = false) {
  const children = new Map();
  for (const r of records) {
    if (!r.Id || !r.CheckupReservationId__c || registration(r) || r.End__c === false || (r.Checkup_Status__c != null && r.Checkup_Status__c !== '10') || String(r.CheckupName__c || '').includes('後處理')) continue;
    if (!children.has(r.CheckupReservationId__c)) children.set(r.CheckupReservationId__c, new Map());
    children.get(r.CheckupReservationId__c).set(r.Id, r);
  }
  const allocated = [], seen = new Set();
  for (const root of records) {
    if (!root.Id || seen.has(root.Id) || !registration(root) || !DURATION_CATEGORIES.includes(root.ResourceCategory__c) || root.End__c === false || (root.Checkup_Status__c != null && root.Checkup_Status__c !== '10')) continue;
    seen.add(root.Id);
    const linkedItems = [...(children.get(root.Id)?.values() || [])].filter(r => r.ResourceCategory__c === root.ResourceCategory__c);
    const usAllocation=root.ResourceCategory__c==='US'?getUsDurationAllocation(linkedItems):null;
    const items=usAllocation?usAllocation.items.map(r=>r.item):linkedItems;
    if (!items.length) continue;
    const people = new Map();
    for (const r of [root, ...items]) if (r.Radiologist__c) people.set(r.Radiologist__c, r.Radiologist__r?.Name);
    const only = people.size === 1 ? [...people.entries()][0] : null;
    const seconds = root.durationSecondsOverride ?? (Date.parse(root.examination_EndTime1__c) - Date.parse(root.examination_StartTime1__c)) / 1000;
    let label = '單次流程';
    if (root.ResourceCategory__c === 'MR') {
      label = root._mrSessionLabel || mrDurationLabel(root,items);
    } else if (root.ResourceCategory__c === 'CT' && [root, ...items].some(r => r.CTAUseTime__c != null)) label = 'CTA流程';
    const selected = sourceFlows ? ['全部', ...new Set(root.ResourceCategory__c === 'US' ? items.map(r=>getUsDurationSubtype(r.CheckupName__c || '')).filter(Boolean) : [])].map(subtype=>({Id:subtype,Checkup__c:subtype,CheckupName__c:subtype})) : items;
    for (const item of selected) allocated.push({...root,
      Id: `allocated:${root.Id}:${item.Id}`, Order__c: `allocated:${root.Id}:${item.Id}`,
      Checkup__c: item.Checkup__c, CheckupName__c: `${root.ResourceCategory__c} ${sourceFlows ? '來源' : '均攤'}｜${label}｜${item.CheckupName__c || '未填項目'}`,
      Radiologist__c: only?.[0] || null, Radiologist__r: {Name: only?.[1] || (people.size > 1 ? '多人共同（未拆分）' : '未填放射師')},
      durationSecondsOverride: sourceFlows ? seconds : usAllocation&&!usAllocation.unsupported?seconds*usAllocation.items.find(r=>r.item.Id===item.Id).weight/usAllocation.totalWeight:seconds/items.length,
      durationIssue: root.durationIssue || (usAllocation?.unsupported ? 'shared' : people.size > 1 ? 'shared' : seconds > MAX_DURATION_SECONDS ? 'outlier' : undefined),
    });
  }
  return buildExamDurationSummaries(allocated, syncedAt).map(row => ({...row, metric_scope: sourceFlows ? 'allocation_flow' : 'allocated'}));
}
