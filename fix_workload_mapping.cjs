const fs = require('fs');

let code = fs.readFileSync('services/store.ts', 'utf8');

const regex = /if \(workloadsRes\.data\) \{\s*this\.workloads = workloadsRes\.data\.map\(\(w: any\) => \(\{\s*\.\.\.w,\s*date: w\.year && w\.month \? `\$\{w\.year\}-\$\{String\(w\.month\)\.padStart\(2, "0"\)\}` : "",\s*radiographerName: w\.radiographerName \|\| w\.radiographer_name \|\| ""\s*\}\)\);\s*\}/m;

const replacement = `if (workloadsRes.data) {
        this.workloads = workloadsRes.data.map((w: any) => ({
          id: w.id,
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
          floorControl: w.floorControl || w.floor_control || 0,
          assist: w.assist || 0,
          scheduler: w.scheduler || 0,
          ct: w.ct || 0,
          dx: w.dx || 0,
          mg: w.mg || 0,
          bmd: w.bmd || 0,
          cta: w.cta || 0,
          tsmcReport: w.tsmcReport || w.tsmc_report || 0,
        }));
      }`;

if (code.match(regex)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync('services/store.ts', code);
  console.log('Fixed initializeDataForUser');
} else {
  console.log('Regex 1 not found');
}

// And also fix loadDataForMonth mapping which was removed? 
// No, in loadDataForMonth I replaced it completely with the same one-liner?
// Let's check loadDataForMonth in store.ts.
