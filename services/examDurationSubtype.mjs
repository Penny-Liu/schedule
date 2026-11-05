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
