const registration=r=>/報到/.test(`${r.ProcessType__c||''} ${r.CheckupName__c||''}`);
const completed=r=>r.End__c!==false&&(r.Checkup_Status__c==null||r.Checkup_Status__c==='10');
const genderOf=(root,items)=>root.Gender__c||items.find(r=>r.Gender__c)?.Gender__c||'';
export function mrDurationLabel(root,items) {
 const count=new Set(items.map(r=>r.Checkup__c||r.CheckupName__c)).size;
 if(!count)return '明細未連結';
 const gender=genderOf(root,items);
 const female=/^(女|F|Female)$/i.test(gender);
 const breast=items.some(r=>/乳房|breast/i.test(r.CheckupName__c||''));
 const size=count>=7?(female&&!breast?'大型套（未含乳房）':'大型套（7 項以上）'):count>=4?'中型套（4～6 項）':'小型套（1～3 項）';
 return `${size}${gender?`・${gender}`:''}`;
}
export function unionDurationIntervals(intervals) {
 if(!intervals.length)return {issue:'missing',seconds:null};
 for(const [start,end]of intervals) {
  if(!start||!end)return {issue:'missing',seconds:null};
  const seconds=(Date.parse(end)-Date.parse(start))/1000;
  if(!Number.isFinite(seconds))return {issue:'invalid',seconds:null};
  if(seconds===0)return {issue:'zero',seconds:0};
  if(seconds<0)return {issue:'negative',seconds};
  if(seconds>14400)return {issue:'outlier',seconds};
 }
 const sorted=intervals.map(([a,b])=>[Date.parse(a),Date.parse(b)]).sort((a,b)=>a[0]-b[0]);
 let [start,end]=sorted[0],total=0;
 for(const [a,b]of sorted.slice(1)) {if(a<=end)end=Math.max(end,b);else{total+=end-start;start=a;end=b;}}
 const seconds=(total+end-start)/1000;
 return {issue:seconds>14400?'outlier':undefined,seconds};
}
function plannedTimestamp(value,date) {
 if(!value)return null;
 if(/^\d{2}:\d{2}/.test(value))return `${date}T${value.replace(/Z$/,'')}+08:00`;
 return value;
}
// 同日同張醫令的整套 MR；不同院區／日期絕不合併，缺少識別時各自保留。
export function normalizeMrDurationSessions(records) {
 const roots=records.filter(r=>r.ResourceCategory__c==='MR'&&registration(r)&&completed(r));
 const groups=new Map();
 for(const root of roots) {
  const key=root.Order__c&&root.CheckStartDate__c?JSON.stringify([root.Order__c,root.CheckStartDate__c,root.Location__c||'']):root.Id;
  const list=groups.get(key)||[];if(!list.some(r=>r.Id===root.Id))list.push(root);groups.set(key,list);
 }
 const replacements=new Map(),mergedRoots=[];
 for(const list of groups.values()) {
  const first=list[0],ids=new Set(list.map(r=>r.Id));
  const items=[...new Map(records.filter(r=>r.ResourceCategory__c==='MR'&&!registration(r)&&completed(r)&&!String(r.CheckupName__c||'').includes('後處理')&&ids.has(r.CheckupReservationId__c)).map(r=>[r.Id,r])).values()];
  const actual=unionDurationIntervals(list.map(r=>[r.examination_StartTime1__c,r.examination_EndTime1__c]));
  const planned=unionDurationIntervals(list.map(r=>[plannedTimestamp(r.StartTime__c,r.CheckStartDate__c),plannedTimestamp(r.EndTime__c,r.CheckStartDate__c)]));
  const people=new Map();for(const r of [...list,...items])if(r.Radiologist__c)people.set(r.Radiologist__c,r.Radiologist__r?.Name);
  const genders=new Set([...list,...items].map(r=>r.Gender__c).filter(Boolean).map(g=>/^(女|F|Female)$/i.test(g)?'女':/^(男|M|Male)$/i.test(g)?'男':g));
  const resources=[...new Set(list.map(r=>r.Resource__r?.Name).filter(Boolean))].sort();
  const merged={...first,Id:`mr-session:${list.map(r=>r.Id).sort().join(':')}`,Gender__c:genders.size===1?[...genders][0]:undefined,
   Resource__c:list.length>1?JSON.stringify([...new Set(list.map(r=>r.Resource__c))].sort()):first.Resource__c,
   Resource__r:{Name:resources.join('＋')||first.Resource__r?.Name},
   durationSecondsOverride:actual.seconds,
   durationIssue:people.size>1||genders.size>1?'shared':actual.issue==='outlier'?'outlier':undefined,
   _plannedDuration:planned,_mrSessionLabel:mrDurationLabel({...first,Gender__c:genders.size===1?[...genders][0]:undefined},items)};
  // 任一分段不完整，不能用其他分段的正值掩蓋問題。
  if(actual.issue==='missing'){merged.examination_StartTime1__c=null;merged.examination_EndTime1__c=null;}
  if(actual.issue==='invalid'){merged.examination_StartTime1__c='invalid';merged.examination_EndTime1__c='invalid';merged.durationSecondsOverride=NaN;}
  for(const id of ids)replacements.set(id,merged.Id);
  mergedRoots.push(merged);
 }
 return [...records.filter(r=>!replacements.has(r.Id)).map(r=>replacements.has(r.CheckupReservationId__c)?{...r,CheckupReservationId__c:replacements.get(r.CheckupReservationId__c)}:r),...mergedRoots];
}
