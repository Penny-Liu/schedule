const fs = require('fs');
let code = fs.readFileSync('services/store.ts', 'utf8');

// 1. Add loadedMonths to class Store
code = code.replace(
  'class Store {\n  users: User[] = [];',
  'class Store {\n  loadedMonths: Set<string> = new Set();\n  users: User[] = [];'
);

// 2. Replace fetchAll methods
const fetchAllRegex = /\/\/ Helper: Fetch all shifts with pagination to bypass 1000-row limit[\s\S]*?private async fetchAllWorkloads\(\) \{\n    return this\.fetchPaginated\("radiographer_workload"\);\n  \}/m;

const newFetchMethods = `
  // Helper: Fetch data by date range
  private async fetchShiftsByRange(startDate: string, endDate: string) {
    return this.fetchPaginated("shifts", (q) => q.gte("date", startDate).lte("date", endDate));
  }

  private async fetchHealthMgmtShiftsByRange(startDate: string, endDate: string) {
    return this.fetchPaginated("health_mgmt_shifts", (q) => q.gte("date", startDate).lte("date", endDate));
  }

  private async fetchDoctorShiftsByRange(startDate: string, endDate: string) {
    return this.fetchPaginated("doctor_shifts", (q) => q.gte("date", startDate).lte("date", endDate));
  }
  
  private async fetchAnesthesiaShiftsByRange(startDate: string, endDate: string) {
    return this.fetchPaginated("anesthesia_shifts", (q) => q.gte("date", startDate).lte("date", endDate));
  }

  private async fetchWorkloadsByRange(startMonth: string, endMonth: string) {
    return this.fetchPaginated("radiographer_workload", (q) => q.gte("date", startMonth).lte("date", endMonth));
  }
  
  private async fetchLeavesByRange(startDate: string, endDate: string) {
    return this.fetchPaginated("leaves", (q) => q.gte("startDate", startDate).lte("endDate", endDate).or(\`endDate.gte.\${startDate},startDate.lte.\${endDate}\`));
  }
  
  private async fetchMeetingRoomsByRange(startDate: string, endDate: string) {
    return this.fetchPaginated("meeting_room_bookings", (q) => q.gte("date", startDate).lte("date", endDate));
  }

  // Generate date window
  private getWindowDates(baseDate: Date) {
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth() - 2, 1);
    const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 3, 0); 
    return {
      startDate: \`\${start.getFullYear()}-\${String(start.getMonth() + 1).padStart(2, '0')}-01\`,
      endDate: \`\${end.getFullYear()}-\${String(end.getMonth() + 1).padStart(2, '0')}-\${String(end.getDate()).padStart(2, '0')}\`,
      startMonth: \`\${start.getFullYear()}-\${String(start.getMonth() + 1).padStart(2, '0')}\`,
      endMonth: \`\${end.getFullYear()}-\${String(end.getMonth() + 1).padStart(2, '0')}\`
    };
  }

  async loadDataForMonth(year: number, month: number) {
    const monthStr = \`\${year}-\${String(month).padStart(2, '0')}\`;
    if (this.loadedMonths.has(monthStr)) return;
    
    console.log(\`[Store] Lazy loading data for \${monthStr}...\`);
    const date = new Date(year, month - 1, 1);
    const { startDate, endDate, startMonth, endMonth } = this.getWindowDates(date);
    
    const [shifts, hmShifts, docShifts, aneShifts, workloads, leaves, meetingRooms] = await Promise.all([
      this.fetchShiftsByRange(startDate, endDate),
      this.fetchHealthMgmtShiftsByRange(startDate, endDate),
      this.fetchDoctorShiftsByRange(startDate, endDate),
      this.fetchAnesthesiaShiftsByRange(startDate, endDate),
      this.fetchWorkloadsByRange(startMonth, endMonth),
      this.fetchLeavesByRange(startDate, endDate),
      this.fetchMeetingRoomsByRange(startDate, endDate)
    ]);
    
    // Merge data avoiding duplicates
    const merge = (existing: any[], incoming: any[]) => {
      const incomingIds = new Set(incoming.map(i => i.id));
      return [...existing.filter(e => !incomingIds.has(e.id)), ...incoming];
    };
    
    if (shifts.data) this.shifts = merge(this.shifts, shifts.data);
    if (hmShifts.data) this.healthMgmtShifts = merge(this.healthMgmtShifts, hmShifts.data);
    if (docShifts.data) this.doctorShifts = merge(this.doctorShifts, docShifts.data);
    if (aneShifts.data) this.anesthesiaShifts = merge(this.anesthesiaShifts, aneShifts.data);
    if (workloads.data) this.workloads = merge(this.workloads, workloads.data);
    if (leaves.data) this.leaves = merge(this.leaves, leaves.data);
    if (meetingRooms.data) this.meetingRoomBookings = merge(this.meetingRoomBookings, meetingRooms.data);
    
    this.loadedMonths.add(monthStr);
    this.notifyListeners();
  }
`;

code = code.replace(fetchAllRegex, newFetchMethods);

// 3. Update initializeData
const initRegex = /const \[\n        usersRes,\n        shiftsRes,\n        leavesRes,\n        settingsRes,\n        doctorsRes,\n        dShiftsRes,\n        hmStaffRes,\n        hmShiftsRes,\n        anesthesiaStaffRes,\n        anesthesiaShiftsRes,\n        workloadsRes,\n        meetingRoomsRes,\n      \] = await Promise\.all\(\[\n        this\.fetchPaginated\("users"\),\n        this\.fetchAllShifts\(\),\n        this\.fetchPaginated\("leaves"\),\n        supabase\.from\("settings"\)\.select\("\*"\), \/\/ Settings is usually 1 row\n        this\.fetchPaginated\("doctors"\),\n        this\.fetchAllDoctorShifts\(\),\n        this\.fetchPaginated\("health_mgmt_staff"\),\n        this\.fetchAllHealthMgmtShifts\(\),\n        this\.fetchPaginated\("anesthesia_staff"\),\n        this\.fetchPaginated\("anesthesia_shifts"\),\n        this\.fetchAllWorkloads\(\),\n        this\.fetchPaginated\("meeting_room_bookings"\),\n      \]\);/m;

const newInit = `
      const now = new Date();
      const { startDate, endDate, startMonth, endMonth } = this.getWindowDates(now);
      this.loadedMonths.add(\`\${now.getFullYear()}-\${String(now.getMonth() + 1).padStart(2, '0')}\`);

      const [
        usersRes,
        shiftsRes,
        leavesRes,
        settingsRes,
        doctorsRes,
        dShiftsRes,
        hmStaffRes,
        hmShiftsRes,
        anesthesiaStaffRes,
        anesthesiaShiftsRes,
        workloadsRes,
        meetingRoomsRes,
      ] = await Promise.all([
        this.fetchPaginated("users"),
        this.fetchShiftsByRange(startDate, endDate),
        this.fetchLeavesByRange(startDate, endDate),
        supabase.from("settings").select("*"),
        this.fetchPaginated("doctors"),
        this.fetchDoctorShiftsByRange(startDate, endDate),
        this.fetchPaginated("health_mgmt_staff"),
        this.fetchHealthMgmtShiftsByRange(startDate, endDate),
        this.fetchPaginated("anesthesia_staff"),
        this.fetchAnesthesiaShiftsByRange(startDate, endDate),
        this.fetchWorkloadsByRange(startMonth, endMonth),
        this.fetchMeetingRoomsByRange(startDate, endDate),
      ]);
`;

code = code.replace(initRegex, newInit);

// 4. Update refreshDoctorShifts
const refreshDocRegex = /async refreshDoctorShifts\(\) \{\n    console\.log\("\[Store\] Refreshing Doctor Shifts\.\.\."\);\n    const \{ data \} = await this\.fetchAllDoctorShifts\(\);\n    if \(data\) \{\n      this\.doctorShifts = data\.map\(\(s: any\) => \(\{\n        \.\.\.s,\n      \}\)\);\n      this\.notifyListeners\(\);\n    \}\n  \}/;

const newRefreshDoc = `async refreshDoctorShifts() {
    console.log("[Store] Refreshing Doctor Shifts...");
    const now = new Date();
    const { startDate, endDate } = this.getWindowDates(now);
    const { data } = await this.fetchDoctorShiftsByRange(startDate, endDate);
    if (data) {
      // Merge
      const incomingIds = new Set(data.map((i: any) => i.id));
      this.doctorShifts = [...this.doctorShifts.filter(e => !incomingIds.has(e.id)), ...data];
      this.notifyListeners();
    }
  }`;

code = code.replace(refreshDocRegex, newRefreshDoc);

fs.writeFileSync('services/store.ts', code);
console.log('Patched store.ts successfully');
