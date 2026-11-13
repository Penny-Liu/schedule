export const HM_LOAD_ALGORITHM='hm-slots-v1';
export const HM_SLOT_MINUTES=10;
export const HM_STAFF_SLOTS=30;
export const HM_LOAD_RULES=[
 {key:'consultation',label:'問診・護理諮詢',slots:2,names:['護理諮詢']},
 {key:'preparation',label:'檢備',slots:2,names:['身高','體重','身高、體重、脈搏呼吸、體溫、腰圍、臀圍','血壓','心電圖','靜態十二導程心電圖','抽血技術']},
 {key:'basicA',label:'基礎 A',slots:1.5,names:['色盲','色盲檢查','視力值','眼壓','驗光','電腦驗光','OCT','眼科光學斷層掃描']},
 {key:'slitLamp',label:'眼科會診・細隙燈',slots:1,names:['細隙燈檢查','眼科會診-細隙燈']},
 {key:'nasopharyngoscopy',label:'耳鼻喉科會診・鼻咽鏡',slots:1,names:['鼻咽內視鏡檢查','耳鼻喉科會診-鼻咽鏡']},
 {key:'hearing',label:'基礎 B・聽力',slots:0.5,names:['聽力','氣導聽力檢測']},
 {key:'lung',label:'基礎 B・肺功能',slots:0.5,names:['肺功能','肺活量、最大吐氣量']},
 {key:'abi',label:'基礎 B・ABI',slots:0.5,names:['ABI','週邊血管動脈檢查ABI']},
 {key:'hrv',label:'基礎 B・HRV',slots:0.5,names:['HRV','自律神經檢查HRV']},
 {key:'pap',label:'基礎 B・婦科會診抹片',slots:1,names:['婦科會診-抹片','子宮頸抹片檢查','子宮頸抹片檢查(癌篩)','新柏氏超薄抹片','液基薄層抹片']},
];
const normalized=value=>String(value||'').trim().replace(/（/g,'(').replace(/）/g,')');
export function classifyHealthMgmtOrder(record) {
 const name=normalized(record.CheckupName__c);
 if(/報到/.test(name+' '+(record.ProcessType__c||'')))return {kind:'flow',key:null};
 const rule=HM_LOAD_RULES.find(rule=>rule.names.some(alias=>normalized(alias)===name));
 if(rule)return {kind:'mapped',key:rule.key};
 const relevant=['檢備','OphE','OphC','EntC','GynC','聽-肺','HRV-ABI'].includes(record.ResourceCategory__c)||/^(眼科檢查|耳鼻喉科檢查|婦科檢查)/.test(name);
 return {kind:relevant?'unmapped':'outside',key:null};
}
export const healthMgmtDemandSlots=counts=>HM_LOAD_RULES.reduce((sum,rule)=>sum+Math.max(0,Number(counts?.[rule.key])||0)*rule.slots,0);
