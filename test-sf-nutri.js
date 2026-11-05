import { isDazhiNutritionConsultation } from "./scripts/daily-stats-counting.mjs";
console.log(isDazhiNutritionConsultation({ Location__c: "大直", CheckupName__c: "營養諮詢", ResourceCategory__c: "NUTR" }));
