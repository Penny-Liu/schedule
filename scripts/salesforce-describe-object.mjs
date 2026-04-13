import { describeSObject, getSalesforceSession } from './salesforce-utils.mjs';

async function main() {
  const objectApiName = process.argv[2];
  if (!objectApiName) {
    throw new Error('請提供 object API name，例如：npm run sf:describe -- Daily_Stats__c');
  }

  const session = await getSalesforceSession();
  const result = await describeSObject({
    ...session,
    objectApiName,
  });

  console.log(`${result.name} (${result.label})`);
  console.log(`fields: ${result.fields.length}\n`);
  result.fields
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((field) => {
      console.log(`${field.name}  |  ${field.label}  |  ${field.type}`);
    });
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
