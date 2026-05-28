const fs = require('fs');

let code = fs.readFileSync('services/store.ts', 'utf8');

// Find the start and end of initializeData
const startIdx = code.indexOf('async initializeData(force: boolean = false) {');
if (startIdx === -1) {
  console.error("Could not find initializeData");
  process.exit(1);
}

// Simple brace matching to find the end of initializeData
let openBraces = 0;
let endIdx = -1;
let started = false;

for (let i = startIdx; i < code.length; i++) {
  if (code[i] === '{') {
    openBraces++;
    started = true;
  } else if (code[i] === '}') {
    openBraces--;
  }
  
  if (started && openBraces === 0) {
    endIdx = i + 1;
    break;
  }
}

if (endIdx === -1) {
  console.error("Could not find end of initializeData");
  process.exit(1);
}

const originalInitData = code.substring(startIdx, endIdx);

const newMethods = `
  async initializeAuthData(force: boolean = false) {
    if (this.isLoaded && !force) return;

    try {
      const logsData = localStorage.getItem("operation_logs");
      if (logsData) {
        this.operationLogs = JSON.parse(logsData);
      }
    } catch (e) {
      console.warn("Failed to load operation logs from localStorage:", e);
    }
    await this.loadOperationLogsFromServer();
    this.setupRealtimeSubscription();

    try {
      console.log("[Store] Loading Auth Data from Supabase...");
      const [usersRes, settingsRes] = await Promise.all([
        this.fetchPaginated("users"),
        supabase.from("settings").select("*"),
      ]);

      if (usersRes.data && usersRes.data.length > 0) {
        this.users = usersRes.data.map((u: any) => {
          const mappedUser = { ...u };
          this.mapFromDbFields(mappedUser);

          let permissions = mappedUser.permissions !== null && mappedUser.permissions !== undefined
              ? [...mappedUser.permissions] : getPermissionsByRole(mappedUser.role);

          if (permissions.includes("staff_edit") || permissions.includes("settings_edit")) {
            if (mappedUser.isHealthMgmt && !permissions.includes("health_mgmt_edit")) permissions.push("health_mgmt_edit");
            if (mappedUser.isRadiographer && !permissions.includes("edit_cloud_schedule")) permissions.push("edit_cloud_schedule");
          }
          if (mappedUser.isHealthMgmt && !permissions.includes("health_mgmt_view")) permissions.push("health_mgmt_view");
          if (mappedUser.isRadiographer && !permissions.includes("physician_view")) permissions.push("physician_view");

          return { ...mappedUser, permissions: Array.from(new Set(permissions)) };
        });
        this.connectionStatus = { type: "Supabase", details: \`Loaded \${this.users.length} users\` };
      } else {
        this.users = MOCK_USERS;
        this.connectionStatus = { type: "Mock", details: \`Fallback triggered.\` };
      }

      let finalSettingsData = null;
      if (settingsRes.data && settingsRes.data.length > 0) {
        finalSettingsData = settingsRes.data[0].data;
        this.settingsRowId = settingsRes.data[0].id;
      } else if (settingsRes.error && settingsRes.error.code === "PGRST116") {
        const fallbackRes = await supabase.from("settings").select("id, data").limit(1).single();
        if (fallbackRes.data && fallbackRes.data.data) {
          finalSettingsData = fallbackRes.data.data;
          this.settingsRowId = fallbackRes.data.id;
        }
      }
      if (finalSettingsData) {
        this.settings = { ...this.settings, ...finalSettingsData };
      }
      this.ensureSettingsIntegrity();

      // Mark as loaded so App can proceed to Login Screen
      this.isLoaded = true;
    } catch (e: any) {
      console.error("Failed to fetch auth data", e);
      this.users = MOCK_USERS;
      this.isLoaded = true;
    }
  }

  async initializeDataForUser(user: User, force: boolean = false) {
    console.log(\`[Store] Loading module data for user \${user.name}...\`);
    const now = new Date();
    const { startDate, endDate, startMonth, endMonth } = this.getWindowDates(now);
    this.loadedMonths.add(\`\${now.getFullYear()}-\${String(now.getMonth() + 1).padStart(2, '0')}\`);

    const perms = user.permissions || [];
    const role = user.role;
    const isAdmin = role === "SYSTEM_ADMIN" || role === "SUPERVISOR";
    
    let shiftsReq = Promise.resolve({ data: null }), leavesReq = Promise.resolve({ data: null }), workloadsReq = Promise.resolve({ data: null }),
        docReq = Promise.resolve({ data: null }), docShiftsReq = Promise.resolve({ data: null }), hmStaffReq = Promise.resolve({ data: null }),
        hmShiftsReq = Promise.resolve({ data: null }), aneStaffReq = Promise.resolve({ data: null }), aneShiftsReq = Promise.resolve({ data: null }),
        meetingRoomsReq = Promise.resolve({ data: null });

    if (perms.includes("view_cloud_schedule") || user.isRadiographer || isAdmin) {
      shiftsReq = this.fetchShiftsByRange(startDate, endDate);
      leavesReq = this.fetchLeavesByRange(startDate, endDate);
      workloadsReq = this.fetchWorkloadsByRange(startMonth, endMonth);
    }
    if (perms.includes("physician_view") || isAdmin || role === "FINANCE") {
      docReq = this.fetchPaginated("doctors");
      docShiftsReq = this.fetchDoctorShiftsByRange(startDate, endDate);
    }
    if (perms.includes("health_mgmt_view") || isAdmin) {
      hmStaffReq = this.fetchPaginated("health_mgmt_staff");
      hmShiftsReq = this.fetchHealthMgmtShiftsByRange(startDate, endDate);
    }
    if (perms.includes("anesthesia_view") || isAdmin) {
      aneStaffReq = this.fetchPaginated("anesthesia_staff");
      aneShiftsReq = this.fetchAnesthesiaShiftsByRange(startDate, endDate);
    }
    if (perms.includes("administrative_view") || isAdmin || role === "HM_SUPERVISOR") {
      meetingRoomsReq = this.fetchMeetingRoomsByRange(startDate, endDate);
    }

    try {
      const [shiftsRes, leavesRes, workloadsRes, doctorsRes, dShiftsRes, hmStaffRes, hmShiftsRes, anesthesiaStaffRes, anesthesiaShiftsRes, meetingRoomsRes] = await Promise.all([
        shiftsReq, leavesReq, workloadsReq, docReq, docShiftsReq, hmStaffReq, hmShiftsReq, aneStaffReq, aneShiftsReq, meetingRoomsReq
      ]);

      if (shiftsRes.data) {
        const uniqueShiftsMap = new Map();
        shiftsRes.data.forEach((s: any) => {
          const mappedShift = { ...s };
          this.mapFromDbFields(mappedShift);
          const key = \`\${mappedShift.userId}-\${mappedShift.date}\`;
          const existing = uniqueShiftsMap.get(key);
          if (!existing) uniqueShiftsMap.set(key, mappedShift);
          else if (!existing.id.includes(" ") && mappedShift.id.includes(" ")) {}
          else uniqueShiftsMap.set(key, mappedShift);
        });
        this.shifts = Array.from(uniqueShiftsMap.values());
      }

      if (leavesRes.data) {
        this.leaves = leavesRes.data.map((l: any) => { const m = {...l}; this.mapFromDbFields(m); return m; });
      }

      if (workloadsRes.data) {
        this.workloads = workloadsRes.data.map((w: any) => ({
          ...w, date: w.year && w.month ? \`\${w.year}-\${String(w.month).padStart(2, "0")}\` : "",
          radiographerName: w.radiographerName || w.radiographer_name || ""
        }));
      }

      if (doctorsRes.data) {
        this.doctors = doctorsRes.data.map((d: any) => ({ ...d, capabilities: d.capabilities || [], locations: d.locations || [], isPartTime: d.is_part_time || false }));
      }

      if (dShiftsRes.data) {
        this.doctorShifts = dShiftsRes.data.map((s: any) => ({ ...s, doctorId: s.doctor_id, workTime: s.work_time, scheduled_station: s.scheduled_station }));
      }

      if (hmStaffRes.data) {
        this.healthMgmtStaff = hmStaffRes.data.map((s: any) => ({ ...s, isActive: s.is_active }));
      }

      if (hmShiftsRes.data) {
        this.healthMgmtShifts = hmShiftsRes.data.map((s: any) => {
          const m = {...s}; this.mapFromDbFields(m);
          let task = m.task || ""; let location = undefined;
          if (task.includes("@@")) { const p = task.split("@@"); task = p[0]; location = p[1]; }
          m.task = task || undefined; m.location = location;
          return m;
        });
      }

      if (anesthesiaStaffRes.data) {
        this.anesthesiaStaff = anesthesiaStaffRes.data.map((as: any) => ({ ...as, isActive: as.is_active, role: as.role || "VIEWER" }));
      }

      if (anesthesiaShiftsRes.data) {
        this.anesthesiaShifts = anesthesiaShiftsRes.data.map((s: any) => ({ ...s, userId: s.user_id, workTime: s.work_time, scheduled_station: s.scheduled_station }));
      }

      if (meetingRoomsRes.data) {
        this.meetingRoomBookings = meetingRoomsRes.data.map((m: any) => ({ ...m, userId: m.user_id, startTime: m.start_time, endTime: m.end_time }));
      }

      console.log("[Store] User specific data loaded successfully.");
    } catch(e) {
      console.error("[Store] Error loading user data", e);
    }
  }
`;

code = code.replace(originalInitData, newMethods);

// Also fix loadDataForMonth to check permissions
const loadDataRegex = /const \[shifts, hmShifts, docShifts, aneShifts, workloads, leaves, meetingRooms\] = await Promise\.all\(\[[\s\S]*?\]\);/m;

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
if (code.match(loadDataRegex)) {
  code = code.replace(loadDataRegex, newLoadData);
}

fs.writeFileSync('services/store.ts', code);
console.log('Re-patched store.ts successfully');
