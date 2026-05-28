const fs = require('fs');

let code = fs.readFileSync('services/store.ts', 'utf8');

const regexMap = /id: w\.id,\s*year: w\.year,\s*month: w\.month,[\s\S]*?tsmcReport: w\.tsmcReport \|\| w\.tsmc_report \|\| 0,/gm;

const replaceWith = `id: w.id,
          year: w.year,
          month: w.month,
          date: w.year && w.month ? \`\${w.year}-\${String(w.month).padStart(2, "0")}\` : "",
          radiographerName: w.radiographerName || w.radiographer_name || "",
          mr: w.mr || 0,
          mrLargeMale: w.mrLargeMale || w.mr_large_male || 0,
          mrLargeFemale: w.mrLargeFemale || w.mr_large_female || 0,
          mrMedium: w.mrMedium || w.mr_medium || 0,
          mrSmall: w.mrSmall || w.mr_small || 0,
          us: w.us || 0,
          usA: w.usA || w.us_a || 0,
          usBreast: w.usBreast || w.us_breast || 0,
          usHeart: w.usHeart || w.us_heart || 0,
          usThy: w.usThy || w.us_thy || 0,
          usCCA: w.usCCA || w.us_cca || 0,
          usNeck: w.usNeck || w.us_neck || 0,
          usPelvisFemale: w.usPelvisFemale || w.us_pelvis_female || 0,
          usPelvisMale: w.usPelvisMale || w.us_pelvis_male || 0,
          ct: w.ct || 0,
          dx: w.dx || 0,
          mg: w.mg || 0,
          bmd: w.bmd || 0,
          cta: w.cta || 0,
          ctaPostProcessing: w.ctaPostProcessing || w.cta_post_processing || 0,
          reportTyping: w.reportTyping || w.report_typing || w.reportEntry || w.report_entry || 0,
          proofreader: w.proofreader || w.imageProofing || w.image_proofing || 0,
          floorControl: w.floorControl || w.floor_control || 0,
          assist: w.assist || 0,
          scheduler: w.scheduler || 0,`;

code = code.replace(regexMap, replaceWith);
fs.writeFileSync('services/store.ts', code);
console.log('Fixed both maps');
