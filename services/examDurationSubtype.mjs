export function getUsDurationSubtype(name) {
  const v = String(name || '').trim().toLowerCase();
  if (v.includes('肝纖維') || v.includes('fibro')) return 'usFibrosis';
  if (v.includes('p女') || (v.includes('骨盆') && v.includes('女')) || v.includes('婦科')) return 'usPelvisFemale';
  if (v.includes('p男') || (v.includes('骨盆') && v.includes('男'))) return 'usPelvisMale';
  if (v.includes('breast') || v.includes('乳房')) return 'usBreast';
  if (v.includes('心臟') || v.includes('心')) return 'usHeart';
  if (v.includes('thy') || v.includes('甲狀')) return 'usThy';
  if (v.includes('cca') || v.includes('頸動脈')) return 'usCCA';
  if (v.includes('neck') || v.includes('頸部') || v.includes('頸')) return 'usNeck';
  if (v.includes('上腹') || v.includes('全腹') || v.includes('腹部')) return 'usA';
  return null;
}

// 使用者指定的集合醫令耗時比例；肝纖維不分配時間。
export const US_DURATION_WEIGHTS = Object.freeze({usThy:1,usCCA:1,usA:2,usPelvisFemale:1,usPelvisMale:1,usBreast:2,usNeck:1,usHeart:3,usFibrosis:0});
export function getUsDurationWeight(name) {
 const subtype=getUsDurationSubtype(name);
 return subtype!==null&&Object.hasOwn(US_DURATION_WEIGHTS,subtype)?US_DURATION_WEIGHTS[subtype]:null;
}
export function getUsDurationAllocation(items) {
 const eligible=items.filter(r=>getUsDurationSubtype(r.CheckupName__c||'')!=='usFibrosis');
 if(!eligible.length)return {items:[],totalWeight:0,unsupported:false};
 const subtypes=new Set(eligible.map(r=>getUsDurationSubtype(r.CheckupName__c||'')));
 // 未提供比例的單一部位仍可獨立計時；混合部位不猜比例。
 const independent=eligible.length===1||(subtypes.size===1&&!subtypes.has(null));
 const weighted=eligible.map(item=>({item,weight:getUsDurationWeight(item.CheckupName__c||'')??(independent?1:null)}));
 const unsupported=weighted.some(r=>r.weight===null);
 return {items:weighted,totalWeight:unsupported?0:weighted.reduce((n,r)=>n+r.weight,0),unsupported};
}
