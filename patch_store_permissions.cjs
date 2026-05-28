const fs = require('fs');

let code = fs.readFileSync('services/store.ts', 'utf8');

// 1. Rename initializeData to initializeAuthData, keeping only users and settings fetching
const initDataRegex = /async initializeData\(force: boolean = false\) \{[\s\S]*?this\.ensureSettingsIntegrity\(\);/m;

const match = code.match(initDataRegex);
if (match) {
  let initDataBlock = match[0];
  
  // Keep the first part (logs, realtime)
  // Modify the Promise.all
  initDataBlock = initDataBlock.replace(/const \[\s*usersRes,\s*shiftsRes,\s*leavesRes,\s*settingsRes,\s*doctorsRes,\s*dShiftsRes,\s*hmStaffRes,\s*hmShiftsRes,\s*anesthesiaStaffRes,\s*anesthesiaShiftsRes,\s*workloadsRes,\s*meetingRoomsRes,\s*\] = await Promise\.all\(\[\s*this\.fetchPaginated\("users"\),\s*this\.fetchShiftsByRange\(startDate, endDate\),\s*this\.fetchLeavesByRange\(startDate, endDate\),\s*supabase\.from\("settings"\)\.select\("\*"\),\s*this\.fetchPaginated\("doctors"\),\s*this\.fetchDoctorShiftsByRange\(startDate, endDate\),\s*this\.fetchPaginated\("health_mgmt_staff"\),\s*this\.fetchHealthMgmtShiftsByRange\(startDate, endDate\),\s*this\.fetchPaginated\("anesthesia_staff"\),\s*this\.fetchAnesthesiaShiftsByRange\(startDate, endDate\),\s*this\.fetchWorkloadsByRange\(startMonth, endMonth\),\s*this\.fetchMeetingRoomsByRange\(startDate, endDate\),\s*\]\);/m, 
  `const [usersRes, settingsRes] = await Promise.all([
        this.fetchPaginated("users"),
        supabase.from("settings").select("*"),
      ]);`);

  initDataBlock = initDataBlock.replace(/const now = new Date\(\);\n      const \{ startDate, endDate, startMonth, endMonth \} = this.getWindowDates\(now\);\n      this\.loadedMonths\.add\(\`\$\{\w+\.getFullYear\(\)\}-\$\{String\(\w+\.getMonth\(\) \+ 1\)\.padStart\(2, '0'\)\}\`\);\n\n/, '');

  initDataBlock = initDataBlock.replace(/shifts: shiftsRes\.error,[\s\S]*hmShifts: hmShiftsRes\.error,/m, 'settings: settingsRes.error');
  
  initDataBlock = initDataBlock.replace(/if \(shiftsRes\.data\) \{[\s\S]*?if \(hmShiftsRes\.data\) \{[\s\S]*?if \(leavesRes\.data && leavesRes\.data\.length > 0\) \{[\s\S]*?if \(error\) console\.error\("Failed to seed leaves:", error\);\n      \}/m, '');

  initDataBlock = initDataBlock.replace('async initializeData(force: boolean = false) {', 'async initializeAuthData(force: boolean = false) {\n    if (this.isLoaded && !force) return;\n    this.isLoaded = true; // Mark as loaded so UI can proceed to login');
  
  // Replace the original block with the auth block
  code = code.replace(initDataRegex, initDataBlock);
}

// 2. Add initializeDataForUser after initializeAuthData
const initDataForUserCode = `
  async initializeDataForUser(user: User) {
      console.log(\`[Store] Loading module data for user \${user.name}...\`);
      const now = new Date();
      const { startDate, endDate, startMonth, endMonth } = this.getWindowDates(now);
      this.loadedMonths.add(\`\${now.getFullYear()}-\${String(now.getMonth() + 1).padStart(2, '0')}\`);

      const perms = user.permissions || [];
      const role = user.role;
      const isAdmin = role === "SYSTEM_ADMIN" || role === "SUPERVISOR";
      
      const fetchJobs: Promise<any>[] = [];
      const jobMap: Record<string, number> = {};

      // Radiographer / Core
      if (perms.includes("view_cloud_schedule") || user.isRadiographer || isAdmin) {
        jobMap.shifts = fetchJobs.length; fetchJobs.push(this.fetchShiftsByRange(startDate, endDate));
        jobMap.leaves = fetchJobs.length; fetchJobs.push(this.fetchLeavesByRange(startDate, endDate));
        jobMap.workloads = fetchJobs.length; fetchJobs.push(this.fetchWorkloadsByRange(startMonth, endMonth));
      }
      
      // Doctors
      if (perms.includes("physician_view") || isAdmin || role === "FINANCE") {
        jobMap.doctors = fetchJobs.length; fetchJobs.push(this.fetchPaginated("doctors"));
        jobMap.dShifts = fetchJobs.length; fetchJobs.push(this.fetchDoctorShiftsByRange(startDate, endDate));
      }

      // Health Mgmt
      if (perms.includes("health_mgmt_view") || isAdmin) {
        jobMap.hmStaff = fetchJobs.length; fetchJobs.push(this.fetchPaginated("health_mgmt_staff"));
        jobMap.hmShifts = fetchJobs.length; fetchJobs.push(this.fetchHealthMgmtShiftsByRange(startDate, endDate));
      }

      // Anesthesia
      if (perms.includes("anesthesia_view") || isAdmin) {
        jobMap.aneStaff = fetchJobs.length; fetchJobs.push(this.fetchPaginated("anesthesia_staff"));
        jobMap.aneShifts = fetchJobs.length; fetchJobs.push(this.fetchAnesthesiaShiftsByRange(startDate, endDate));
      }
      
      // Meeting Rooms
      if (perms.includes("administrative_view") || isAdmin || role === "HM_SUPERVISOR") {
        jobMap.meetings = fetchJobs.length; fetchJobs.push(this.fetchMeetingRoomsByRange(startDate, endDate));
      }
      
      const results = await Promise.all(fetchJobs);
      
      const getRes = (key: string) => jobMap[key] !== undefined ? results[jobMap[key]] : { data: null, error: null };
      
      const shiftsRes = getRes("shifts");
      const leavesRes = getRes("leaves");
      const workloadsRes = getRes("workloads");
      const doctorsRes = getRes("doctors");
      const dShiftsRes = getRes("dShifts");
      const hmStaffRes = getRes("hmStaff");
      const hmShiftsRes = getRes("hmShifts");
      const anesthesiaStaffRes = getRes("aneStaff");
      const anesthesiaShiftsRes = getRes("aneShifts");
      const meetingRoomsRes = getRes("meetings");
      
      // Process Shifts
      if (shiftsRes.data) {
        const uniqueShiftsMap = new Map();
        shiftsRes.data.forEach((s: any) => {
          const mappedShift = { ...s };
          this.mapFromDbFields(mappedShift);
          const key = \`\${mappedShift.userId}-\${mappedShift.date}\`;
          const existing = uniqueShiftsMap.get(key);
          if (!existing) {
            uniqueShiftsMap.set(key, mappedShift);
          } else {
            const isExistingIdBad = existing.id.includes(" ");
            const isNewIdBad = mappedShift.id.includes(" ");
            if (isExistingIdBad && !isNewIdBad) {
              uniqueShiftsMap.set(key, mappedShift);
            } else if ((existing.station === "Unassigned" || existing.station === "未分配" || !existing.station) && 
                       (mappedShift.station && mappedShift.station !== "Unassigned" && mappedShift.station !== "未分配")) {
                uniqueShiftsMap.set(key, mappedShift);
            }
          }
        });
        this.shifts = Array.from(uniqueShiftsMap.values());
      }
      
      // Process Leaves
      if (leavesRes.data && leavesRes.data.length > 0) {
        this.leaves = leavesRes.data.map((l: any) => {
          const mapped = { ...l };
          this.mapFromDbFields(mapped);
          return mapped;
        });
      }
      
      // Process Health Mgmt Shifts
      if (hmShiftsRes.data) {
        this.healthMgmtShifts = hmShiftsRes.data.map((s: any) => {
          const mapped = { ...s };
          this.mapFromDbFields(mapped);
          let task = mapped.task || "";
          let location = undefined;
          if (task.includes("@@")) {
            const parts = task.split("@@");
            task = parts[0];
            location = parts[1];
          }
          if (task === "") task = undefined;
          mapped.task = task;
          mapped.location = location;
          return mapped;
        });
      }
`;

code = code.replace('// Load Doctors and Doctor Shifts', initDataForUserCode + '\n      // Load Doctors and Doctor Shifts');

// Modify loadDataForMonth to check permissions
const loadDataRegex = /const \[shifts, hmShifts, docShifts, aneShifts, workloads, leaves, meetingRooms\] = await Promise\.all\(\[[\s\S]*?fetchMeetingRoomsByRange\(startDate, endDate\)[\s\S]*?\]\);/m;

const newLoadData = `
    const user = this.currentUser;
    const perms = user?.permissions || [];
    const role = user?.role;
    const isAdmin = role === "SYSTEM_ADMIN" || role === "SUPERVISOR";
    
    let shiftsReq = Promise.resolve({ data: null }), leavesReq = Promise.resolve({ data: null }), workloadsReq = Promise.resolve({ data: null }),
        docShiftsReq = Promise.resolve({ data: null }), hmShiftsReq = Promise.resolve({ data: null }), aneShiftsReq = Promise.resolve({ data: null }),
        meetingRoomsReq = Promise.resolve({ data: null });
        
    if (perms.includes("view_cloud_schedule") || user?.isRadiographer || isAdmin) {
      shiftsReq = this.fetchShiftsByRange(startDate, endDate);
      leavesReq = this.fetchLeavesByRange(startDate, endDate);
      workloadsReq = this.fetchWorkloadsByRange(startMonth, endMonth);
    }
    if (perms.includes("physician_view") || isAdmin || role === "FINANCE") {
      docShiftsReq = this.fetchDoctorShiftsByRange(startDate, endDate);
    }
    if (perms.includes("health_mgmt_view") || isAdmin) {
      hmShiftsReq = this.fetchHealthMgmtShiftsByRange(startDate, endDate);
    }
    if (perms.includes("anesthesia_view") || isAdmin) {
      aneShiftsReq = this.fetchAnesthesiaShiftsByRange(startDate, endDate);
    }
    if (perms.includes("administrative_view") || isAdmin || role === "HM_SUPERVISOR") {
      meetingRoomsReq = this.fetchMeetingRoomsByRange(startDate, endDate);
    }

    const [shifts, hmShifts, docShifts, aneShifts, workloads, leaves, meetingRooms] = await Promise.all([
      shiftsReq, hmShiftsReq, docShiftsReq, aneShiftsReq, workloadsReq, leavesReq, meetingRoomsReq
    ]);
`;

code = code.replace(loadDataRegex, newLoadData);

fs.writeFileSync('services/store.ts', code);
console.log('Patched store.ts successfully');
