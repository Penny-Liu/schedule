import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
it('schedules HM independently at Taiwan 14:00 and avoids duplicate shared automatic runs',()=>{
 const own=readFileSync('.github/workflows/sync-health-mgmt-load.yml','utf8');
 const shared=readFileSync('.github/workflows/sync-stats.yml','utf8');
 expect(own).toContain('cron: "0 6 * * *"');expect(own).toContain('run: npm run sync-health-mgmt-load -- --write');expect(own).not.toContain('sync-exam-duration');
 expect(shared).not.toContain('{"id":6,"selected":true}');
});
