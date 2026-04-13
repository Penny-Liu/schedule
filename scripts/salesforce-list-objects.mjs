import { getSalesforceSession, listSObjects } from './salesforce-utils.mjs';

async function main() {
  const keyword = (process.argv[2] || '').toLowerCase().trim();
  const session = await getSalesforceSession();
  const sobjects = await listSObjects(session);

  const filtered = sobjects
    .filter((obj) => {
      if (!keyword) return true;
      return [obj.name, obj.label, obj.labelPlural]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword));
    })
    .sort((a, b) => {
      if (a.custom !== b.custom) return a.custom ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  console.log(`找到 ${filtered.length} 個物件${keyword ? `，關鍵字：${keyword}` : ''}\n`);
  filtered.forEach((obj) => {
    console.log(`${obj.custom ? '[Custom]' : '[Std]   '} ${obj.name}  |  ${obj.label}`);
  });
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
