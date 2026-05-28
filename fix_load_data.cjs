const fs = require('fs');

let code = fs.readFileSync('services/store.ts', 'utf8');

const regex = /const \[shifts, hmShifts, docShifts, aneShifts, workloads, leaves, meetingRooms\] = await Promise\.all\([\s\S]*?this\.notifyListeners\(\);\n  \}/m;

const replacement = `const [shiftsRes, hmShiftsRes, dShiftsRes, aneShiftsRes, workloadsRes, leavesRes, meetingRoomsRes] = await Promise.all([
      shiftsReq, hmShiftsReq, docShiftsReq, aneShiftsReq, workloadsReq, leavesReq, meetingRoomsReq
    ]);

    const merge = (existing: any[], incoming: any[]) => {
      const incomingIds = new Set(incoming.map(i => i.id));
      return [...existing.filter(e => !incomingIds.has(e.id)), ...incoming];
    };
    
    if (shiftsRes.data) {
      const parsed = shiftsRes.data.map((s: any) => { const m = {...s}; this.mapFromDbFields(m); return m; });
      this.shifts = merge(this.shifts, parsed);
    }
    if (hmShiftsRes.data) {
      const parsed = hmShiftsRes.data.map((s: any) => {
        const m = {...s}; this.mapFromDbFields(m);
        let task = m.task || ""; let location = undefined;
        if (task.includes("@@")) { const p = task.split("@@"); task = p[0]; location = p[1]; }
        m.task = task || undefined; m.location = location;
        return m;
      });
      this.healthMgmtShifts = merge(this.healthMgmtShifts, parsed);
    }
    if (dShiftsRes.data) {
      const parsed = dShiftsRes.data.map((s: any) => ({ ...s, doctorId: s.doctor_id, workTime: s.work_time, scheduled_station: s.scheduled_station }));
      this.doctorShifts = merge(this.doctorShifts, parsed);
    }
    if (aneShiftsRes.data) {
      const parsed = aneShiftsRes.data.map((s: any) => ({ ...s, userId: s.user_id, workTime: s.work_time, scheduled_station: s.scheduled_station }));
      this.anesthesiaShifts = merge(this.anesthesiaShifts, parsed);
    }
    if (workloadsRes.data) {
      const parsed = workloadsRes.data.map((w: any) => ({
          id: w.id, year: w.year, month: w.month,
          date: w.year && w.month ? \`\${w.year}-\${String(w.month).padStart(2, "0")}\` : "",
          radiographerName: w.radiographerName || w.radiographer_name || "",
          mr: w.mr || 0, mrLargeMale: w.mrLargeMale || w.mr_large_male || 0, mrLargeFemale: w.mrLargeFemale || w.mr_large_female || 0,
          mrMedium: w.mrMedium || w.mr_medium || 0, mrSmall: w.mrSmall || w.mr_small || 0,
          us: w.us || 0, usA: w.usA || w.us_a || 0, usBreast: w.usBreast || w.us_breast || 0,
          usHeart: w.usHeart || w.us_heart || 0, usThy: w.usThy || w.us_thy || 0,
          usCCA: w.usCCA || w.us_cca || 0, usNeck: w.usNeck || w.us_neck || 0,
          usPelvisFemale: w.usPelvisFemale || w.us_pelvis_female || 0, usPelvisMale: w.usPelvisMale || w.us_pelvis_male || 0,
          floorControl: w.floorControl || w.floor_control || 0, assist: w.assist || 0, scheduler: w.scheduler || 0,
          ct: w.ct || 0, dx: w.dx || 0, mg: w.mg || 0, bmd: w.bmd || 0, cta: w.cta || 0,
          tsmcReport: w.tsmcReport || w.tsmc_report || 0,
      }));
      this.workloads = merge(this.workloads, parsed);
    }
    if (leavesRes.data) {
      const parsed = leavesRes.data.map((l: any) => { const m = {...l}; this.mapFromDbFields(m); return m; });
      this.leaves = merge(this.leaves, parsed);
    }
    if (meetingRoomsRes.data) {
      const parsed = meetingRoomsRes.data.map((m: any) => ({ ...m, userId: m.user_id, startTime: m.start_time, endTime: m.end_time }));
      this.meetingRoomBookings = merge(this.meetingRoomBookings, parsed);
    }
    
    this.loadedMonths.add(monthStr);
    this.notifyListeners();
  }`;

if (code.match(regex)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync('services/store.ts', code);
  console.log('Fixed loadDataForMonth');
} else {
  console.log('Regex 2 not found');
}
