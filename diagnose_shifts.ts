
import { db } from './services/store';

async function diagnose() {
    await db.initializeData(true);
    const dates = ['2026-04-10', '2026-04-11', '2026-04-15', '2026-04-16', '2026-04-17', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-28', '2026-04-30', '2026-05-03', '2026-05-04', '2026-05-06'];
    
    console.log('--- Diagnosis for Assistant Shift Issue ---');
    for (const d of dates) {
        console.log(`\nDate: ${d}`);
        const radShifts = db.shifts.filter(s => s.date === d);
        const hmShifts = db.getHealthMgmtShifts().filter(s => s.date === d);
        
        console.log('  Radiographer Shifts (db.shifts):');
        radShifts.forEach(s => {
            const u = db.getUsers().find(user => user.id === s.userId);
            console.log(`    - User: ${u?.name || s.userId}, Station: "${s.station}", SpecialRoles: ${JSON.stringify(s.specialRoles)}`);
        });
        
        console.log('  Health Mgmt Shifts:');
        hmShifts.forEach(s => {
            const st = db.getHealthMgmtStaff().find(staff => staff.id === s.userId);
            console.log(`    - Staff: ${st?.name || s.userId}, Task: "${s.task}", Station: "${s.station}"`);
        });
    }
}

diagnose();
