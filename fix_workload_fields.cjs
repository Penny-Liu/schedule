const fs = require('fs');
let code = fs.readFileSync('services/store.ts', 'utf8');

const regexTo = /private mapToDbFields\(obj: any\) \{\s*const mapping: Record<string, string> = \{([\s\S]*?)\};\s*Object\.keys/;
const regexFrom = /private mapFromDbFields\(obj: any\) \{\s*const mapping: Record<string, string> = \{([\s\S]*?)\};\s*Object\.keys/;

const toFields = `
      radiographerName: "radiographer_name",
      mrLargeMale: "mr_large_male",
      mrLargeFemale: "mr_large_female",
      mrMedium: "mr_medium",
      mrSmall: "mr_small",
      usA: "us_a",
      usBreast: "us_breast",
      usHeart: "us_heart",
      usThy: "us_thy",
      usCCA: "us_neck",
      usNeck: "us_cca",
      usPelvisFemale: "us_pelvis_female",
      usPelvisMale: "us_pelvis_male",
      ctaPostProcessing: "cta_post_processing",
      reportTyping: "report_entry",
      proofreader: "image_proofing",
      tsmcReport: "tsmc_report"
`;

const fromFields = `
      radiographer_name: "radiographerName",
      mr_large_male: "mrLargeMale",
      mr_large_female: "mrLargeFemale",
      mr_medium: "mrMedium",
      mr_small: "mrSmall",
      us_a: "usA",
      us_breast: "usBreast",
      us_heart: "usHeart",
      us_thy: "usThy",
      us_neck: "usCCA",
      us_cca: "usNeck",
      us_pelvis_female: "usPelvisFemale",
      us_pelvis_male: "usPelvisMale",
      cta_post_processing: "ctaPostProcessing",
      report_entry: "reportTyping",
      image_proofing: "proofreader",
      tsmc_report: "tsmcReport"
`;

code = code.replace(regexTo, (match, p1) => {
  return match.replace(p1, p1.trimEnd() + "," + toFields);
});

code = code.replace(regexFrom, (match, p1) => {
  return match.replace(p1, p1.trimEnd() + "," + fromFields);
});

fs.writeFileSync('services/store.ts', code);
console.log('Fixed workload fields mapping');
