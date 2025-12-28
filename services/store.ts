import { User, Shift, LeaveRequest, SystemSettings, StationDefault, SYSTEM_OFF, RosterCycle, DateEventType, Holiday, LeaveStatus, LeaveType, StaffGroup, SPECIAL_ROLES } from '../types';
import { MOCK_USERS, MOCK_LEAVES } from './mockData';
import { supabase } from './supabaseClient';

class Store {
  users: User[] = [];
  shifts: Shift[] = [];
  leaves: LeaveRequest[] = [];
  settings: SystemSettings = { 
    stations: Object.values(StationDefault),
    cycles: [],
    holidays: [],
    stationRequirements: {},
    cycleStartDate: '2024-01-01',
    stationDisplayOrder: []
  };
  currentUser: User | null = null;
  isLoaded: boolean = false;

  constructor() {
    // We do not load in constructor anymore because it needs to be async
  }

  // New method to fetch all data from Supabase
  async initializeData() {
    if (this.isLoaded) return;

    try {
      console.log('Fetching data from Supabase...');
      
      const [usersRes, shiftsRes, leavesRes, settingsRes] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('shifts').select('*'),
        supabase.from('leaves').select('*'),
        supabase.from('settings').select('data').eq('id', 1).single()
      ]);

      if (usersRes.data && usersRes.data.length > 0) {
        this.users = usersRes.data;
      } else {
        // If DB is empty, use Mock and seed DB (Optional, executed only once)
        console.log('Database empty, seeding mock users...');
        this.users = MOCK_USERS;
        await supabase.from('users').insert(MOCK_USERS);
      }

      if (shiftsRes.data) this.shifts = shiftsRes.data;
      if (leavesRes.data) {
          // If empty, maybe seed mock leaves
          if (leavesRes.data.length === 0 && this.users === MOCK_USERS) {
               this.leaves = MOCK_LEAVES;
               await supabase.from('leaves').insert(MOCK_LEAVES);
          } else {
               this.leaves = leavesRes.data;
          }
      }

      if (settingsRes.data && settingsRes.data.data) {
        this.settings = { ...this.settings, ...settingsRes.data.data };
      } else {
        // Init settings row
        await this.saveSettings();
      }

      // Migration checks (Same as before)
      this.ensureSettingsIntegrity();

      this.isLoaded = true;
      console.log('Data initialized successfully');
    } catch (e) {
      console.error("Failed to fetch data from Supabase", e);
      // Fallback to local storage or mock if critical failure
      this.loadFromLocalStorage();
    }
  }

  private loadFromLocalStorage() {
      // Legacy fallback
      try {
        const storedUsers = localStorage.getItem('med_users');
        if (storedUsers) this.users = JSON.parse(storedUsers);
        else this.users = MOCK_USERS;
        // ... Load others if needed
        this.isLoaded = true;
      } catch (e) { console.error(e); }
  }

  private ensureSettingsIntegrity() {
      // Logic from previous load() to ensure structure is correct
        if (!this.settings.stationRequirements) this.settings.stationRequirements = {};
        if (!this.settings.cycleStartDate) this.settings.cycleStartDate = '2024-01-01';
        if (!this.settings.stationDisplayOrder) this.settings.stationDisplayOrder = [];
        if (!this.settings.holidays) {
            this.settings.holidays = [];
        } else {
            this.settings.holidays = this.settings.holidays.map(h => ({
                ...h,
                type: h.type || DateEventType.NATIONAL
            }));
        }
        this.settings.stations.forEach(s => {
            if (s !== SYSTEM_OFF) {
                const req = this.settings.stationRequirements[s];
                if (!req || !Array.isArray(req)) {
                    const oldVal = typeof req === 'number' ? req : 1;
                    this.settings.stationRequirements[s] = [oldVal, oldVal, oldVal, oldVal, oldVal, oldVal, oldVal];
                }
            }
        });
  }

  // --- Data Persistence Methods (Sync Local + Async Remote) ---

  // Settings
  private async saveSettings() {
    // 1. Local update (already done by caller usually)
    // 2. Remote update
    const { error } = await supabase
        .from('settings')
        .upsert({ id: 1, data: this.settings });
    
    if (error) console.error('Error saving settings:', error);
  }

  // Auth
  login(email: string): User | undefined {
    const user = this.users.find(u => u.email === email);
    if (user) {
      this.currentUser = user;
      return user;
    }
    return undefined;
  }

  logout() {
    this.currentUser = null;
  }

  async changePassword(userId: string, newPass: string) {
      const u = this.users.find(u => u.id === userId);
      if (u) {
          u.password = newPass;
          // Sync DB
          await supabase.from('users').update({ password: newPass }).eq('id', userId);
      }
  }

  async resetPassword(userId: string) {
      const u = this.users.find(u => u.id === userId);
      if (u) {
          u.password = '1234';
          // Sync DB
          await supabase.from('users').update({ password: '1234' }).eq('id', userId);
      }
  }

  // Users
  getUsers() { return this.users; }
  
  async addUser(user: User) {
    this.users.push(user);
    await supabase.from('users').insert(user);
  }
  
  async updateUser(id: string, updates: Partial<User>) {
    this.users = this.users.map(u => u.id === id ? { ...u, ...updates } : u);
    await supabase.from('users').update(updates).eq('id', id);
  }
  
  async deleteUser(id: string) {
    this.users = this.users.filter(u => u.id !== id);
    await supabase.from('users').delete().eq('id', id);
  }

  // Shifts
  getShifts(startDate: string, endDate: string) {
    if (!startDate && !endDate) return this.shifts;
    return this.shifts.filter(s => s.date >= startDate && s.date <= endDate);
  }
  
  async upsertShift(shift: Shift) {
    const index = this.shifts.findIndex(s => s.userId === shift.userId && s.date === shift.date);
    if (index >= 0) {
      this.shifts[index] = shift;
    } else {
      this.shifts.push(shift);
    }
    // Sync DB
    await supabase.from('shifts').upsert(shift);
  }

  // Leaves
  getLeaves() { return this.leaves; }
  
  async addLeave(leave: LeaveRequest) {
    this.leaves.push(leave);
    await supabase.from('leaves').insert(leave);
  }

  async updateLeaveTargetApproval(id: string, approvalStatus: 'AGREED' | 'REJECTED') {
      const leaveIndex = this.leaves.findIndex(l => l.id === id);
      if (leaveIndex === -1) return;
      
      const leave = this.leaves[leaveIndex];
      const newStatus = approvalStatus === 'REJECTED' ? LeaveStatus.REJECTED : leave.status;

      const updates = { targetApproval: approvalStatus, status: newStatus };
      this.leaves[leaveIndex] = { ...leave, ...updates };
      
      await supabase.from('leaves').update(updates).eq('id', id);
  }

  async updateLeaveStatus(id: string, status: LeaveStatus, approverId: string) {
    const leaveIndex = this.leaves.findIndex(l => l.id === id);
    if (leaveIndex === -1) return;

    const leave = this.leaves[leaveIndex];
    const processedAt = new Date().toISOString();
    
    // 1. Update Leave Record
    const updatedLeave = { ...leave, status, approverId, processedAt };
    this.leaves[leaveIndex] = updatedLeave;
    
    await supabase.from('leaves').update({ status, approverId, processedAt }).eq('id', id);
    
    // 2. If Approved, update shifts (Logic remains same, but calls upsertShift which handles DB)
    if (status === LeaveStatus.APPROVED) {
        await this.applyLeaveToShifts(updatedLeave);
    }
  }

  // Helper to apply approved leave to shifts
  private async applyLeaveToShifts(leave: LeaveRequest) {
        const startDate = new Date(leave.startDate);
        const endDate = new Date(leave.endDate);
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];

            if (leave.type === LeaveType.PRE_SCHEDULED || leave.type === LeaveType.LONG_LEAVE) {
                await this.upsertShift({
                    id: `${leave.userId}-${dateStr}`,
                    userId: leave.userId,
                    date: dateStr,
                    station: SYSTEM_OFF,
                    specialRoles: [],
                    isAutoGenerated: false
                });
            } else if (leave.type === LeaveType.CANCEL_LEAVE) {
                await this.upsertShift({
                    id: `${leave.userId}-${dateStr}`,
                    userId: leave.userId,
                    date: dateStr,
                    station: StationDefault.UNASSIGNED,
                    specialRoles: [],
                    isAutoGenerated: false
                });
            } else if (leave.type === LeaveType.SWAP_SHIFT) {
                await this.upsertShift({
                    id: `${leave.userId}-${dateStr}`,
                    userId: leave.userId,
                    date: dateStr,
                    station: SYSTEM_OFF,
                    specialRoles: [],
                    isAutoGenerated: false
                });
                if (leave.targetUserId) {
                    await this.upsertShift({
                        id: `${leave.targetUserId}-${dateStr}`,
                        userId: leave.targetUserId,
                        date: dateStr,
                        station: StationDefault.UNASSIGNED,
                        specialRoles: [],
                        isAutoGenerated: false
                    });
                }
            } else if (leave.type === LeaveType.DUTY_SWAP) {
                // Logic for Duty Swap
                const requestorShift = this.shifts.find(s => s.userId === leave.userId && s.date === dateStr);
                const targetShift = this.shifts.find(s => s.userId === leave.targetUserId && s.date === dateStr);

                if (requestorShift && leave.targetUserId) {
                    const rolesToSwap = requestorShift.specialRoles.filter(r => 
                        leave.roleToSwap ? r === leave.roleToSwap : Object.values(SPECIAL_ROLES).includes(r)
                    );

                    const newRequestorRoles = requestorShift.specialRoles.filter(r => !rolesToSwap.includes(r));
                    await this.upsertShift({
                        ...requestorShift,
                        specialRoles: newRequestorRoles,
                        isAutoGenerated: false
                    });

                    const newTargetShift = targetShift ? { ...targetShift } : {
                        id: `${leave.targetUserId}-${dateStr}`,
                        userId: leave.targetUserId,
                        date: dateStr,
                        station: StationDefault.UNASSIGNED,
                        specialRoles: [],
                        isAutoGenerated: false
                    };
                    
                    newTargetShift.specialRoles = [...new Set([...newTargetShift.specialRoles, ...rolesToSwap])];
                    newTargetShift.isAutoGenerated = false;
                    await this.upsertShift(newTargetShift);
                }
            }
        }
  }

  // Settings: Stations
  getStations() { return this.settings.stations; }
  getStationRequirements() { return this.settings.stationRequirements || {}; }
  
  async addStation(name: string) {
    if (!this.settings.stations.includes(name)) {
      this.settings.stations.push(name);
      this.settings.stationRequirements[name] = [1, 1, 1, 1, 1, 1, 1];
      await this.saveSettings();
    }
  }
  async removeStation(name: string) {
    this.settings.stations = this.settings.stations.filter(s => s !== name);
    delete this.settings.stationRequirements[name];
    await this.saveSettings();
  }
  async updateStationRequirement(name: string, dayIndex: number, count: number) {
    if (this.settings.stationRequirements[name]) {
        this.settings.stationRequirements[name][dayIndex] = count;
        await this.saveSettings();
    }
  }

  // Settings: Display Order
  getStationDisplayOrder(): string[] {
      const currentStations = this.settings.stations.filter(s => s !== SYSTEM_OFF && s !== StationDefault.UNASSIGNED);
      const specialRoles = [SPECIAL_ROLES.OPENING, SPECIAL_ROLES.LATE, SPECIAL_ROLES.ASSIST, SPECIAL_ROLES.SCHEDULER];
      const systemRows = [StationDefault.UNASSIGNED, SYSTEM_OFF];
      const allItems = [...new Set([...currentStations, ...specialRoles, ...systemRows])];
      const savedOrder = this.settings.stationDisplayOrder || [];
      const mergedOrder = [
          ...savedOrder.filter(item => allItems.includes(item)),
          ...allItems.filter(item => !savedOrder.includes(item))
      ];
      return mergedOrder;
  }

  async updateStationDisplayOrder(newOrder: string[]) {
      this.settings.stationDisplayOrder = newOrder;
      await this.saveSettings();
  }

  // Settings: Cycles
  getCycles() { return this.settings.cycles; }
  async addCycle(cycle: RosterCycle) {
    this.settings.cycles.push(cycle);
    this.settings.cycles.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    await this.saveSettings();
  }
  async deleteCycle(id: string) {
    this.settings.cycles = this.settings.cycles.filter(c => c.id !== id);
    await this.saveSettings();
  }

  getCycleStartDate() {
      return this.settings.cycleStartDate || '2024-01-01';
  }

  async updateCycleStartDate(date: string) {
      this.settings.cycleStartDate = date;
      await this.saveSettings();
  }

  // Settings: Holidays / Events
  getHolidays() { return this.settings.holidays || []; }
  
  async addHoliday(holiday: Holiday) {
      if (!this.settings.holidays) this.settings.holidays = [];
      if (!this.settings.holidays.some(h => h.date === holiday.date)) {
          this.settings.holidays.push(holiday);
          this.settings.holidays.sort((a, b) => a.date.localeCompare(b.date));
          await this.saveSettings();
      }
  }
  
  async removeHoliday(date: string) {
      if (this.settings.holidays) {
          this.settings.holidays = this.settings.holidays.filter(h => h.date !== date);
          await this.saveSettings();
      }
  }

  getEvent(date: string): Holiday | undefined {
      return this.settings.holidays?.find(h => h.date === date);
  }

  importTaiwanHolidays() {
      // ... (Keep existing holiday list logic)
      const rawHolidays = [
          { date: '2025-01-01', name: '元旦' },
          { date: '2025-01-27', name: '農曆春節' },
          { date: '2025-01-28', name: '除夕' },
          { date: '2025-01-29', name: '春節' },
          { date: '2025-01-30', name: '春節' },
          { date: '2025-01-31', name: '春節' },
          { date: '2025-02-28', name: '和平紀念日' },
          { date: '2025-04-03', name: '兒童節' },
          { date: '2025-04-04', name: '清明節' },
          { date: '2025-05-01', name: '勞動節' },
          { date: '2025-05-30', name: '端午節' },
          { date: '2025-05-31', name: '端午節' },
          { date: '2025-10-06', name: '中秋節' },
          { date: '2025-10-10', name: '國慶日' },
          { date: '2026-01-01', name: '元旦' },
          { date: '2026-02-16', name: '除夕' }, 
          { date: '2026-02-17', name: '春節' },
          { date: '2026-02-28', name: '和平紀念日' },
          { date: '2026-04-04', name: '兒童清明' },
          { date: '2026-05-01', name: '勞動節' },
          { date: '2026-06-19', name: '端午節' },
          { date: '2026-09-25', name: '中秋節' },
          { date: '2026-10-10', name: '國慶日' },
      ];

      const today = new Date().toISOString().split('T')[0];
      const futureHolidays = rawHolidays.filter(h => h.date >= today);
      
      let addedCount = 0;
      if (!this.settings.holidays) this.settings.holidays = [];

      futureHolidays.forEach(h => {
          if (!this.settings.holidays.some(exist => exist.date === h.date)) {
              this.settings.holidays.push({
                  date: h.date,
                  name: h.name,
                  type: DateEventType.NATIONAL
              });
              addedCount++;
          }
      });

      this.settings.holidays.sort((a, b) => a.date.localeCompare(b.date));
      this.saveSettings();
      return addedCount;
  }

  calculateBaseStatus(dateStr: string, groupId: StaffGroup): string | null {
    // Keep exact logic, this is pure calculation
    const referenceDate = new Date(this.settings.cycleStartDate || '2024-01-01');
    const targetDate = new Date(dateStr);
    const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const diffTime = target.getTime() - ref.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays < 0) return null;
    let offset = 0;
    if (groupId === StaffGroup.GROUP_B) offset = 2;
    if (groupId === StaffGroup.GROUP_C) offset = 4;
    const cycleDay = (diffDays + offset) % 6;
    if (cycleDay >= 4) {
      return SYSTEM_OFF;
    }
    return null;
  }

  getUserStatusOnDate(userId: string, dateStr: string): 'WORK' | 'OFF' {
    // Keep exact logic
    const user = this.users.find(u => u.id === userId);
    if (!user) return 'OFF';
    const shift = this.shifts.find(s => s.userId === userId && s.date === dateStr);
    if (shift) {
        return shift.station === SYSTEM_OFF ? 'OFF' : 'WORK';
    }
    const event = this.getEvent(dateStr);
    if (event && event.type === DateEventType.CLOSED) {
        return 'OFF';
    }
    const baseStatus = this.calculateBaseStatus(dateStr, user.groupId);
    if (baseStatus === SYSTEM_OFF) {
        return 'OFF';
    }
    const approvedLeave = this.leaves.find(l => 
        l.userId === userId && 
        l.status === LeaveStatus.APPROVED &&
        dateStr >= l.startDate && 
        dateStr <= l.endDate
    );
    if (approvedLeave) return 'OFF';
    return 'WORK';
  }

  getUsersOffOnDate(dateStr: string): User[] {
    return this.users.filter(user => this.getUserStatusOnDate(user.id, dateStr) === 'OFF');
  }

  getUsersWorkingOnDate(dateStr: string): User[] {
    return this.users.filter(user => this.getUserStatusOnDate(user.id, dateStr) === 'WORK');
  }

  // --- Auto Schedule Functions ---
  // Note: These modify "this.shifts" in a loop.
  // To optimize, we should batch database updates, but for simplicity/code preservation, 
  // we will call upsertShift inside (which awaits DB). 
  // It might be slower but ensures consistency.
  
  async autoAssignSpecialRoles(startDate: string, endDate: string) {
      // ... (Existing Logic, but make it async to wait for DB saves)
      const start = new Date(startDate);
      const end = new Date(endDate);
      const specialRolesToAssign = [SPECIAL_ROLES.OPENING, SPECIAL_ROLES.LATE];

      const roleCounts: Record<string, Record<string, number>> = {
          [SPECIAL_ROLES.OPENING]: {},
          [SPECIAL_ROLES.LATE]: {}
      };
      this.users.forEach(u => {
          roleCounts[SPECIAL_ROLES.OPENING][u.id] = 0;
          roleCounts[SPECIAL_ROLES.LATE][u.id] = 0;
      });
      this.shifts.forEach(s => {
          if (s.specialRoles) {
              s.specialRoles.forEach(r => {
                  if (roleCounts[r] && roleCounts[r][s.userId] !== undefined) {
                      roleCounts[r][s.userId]++;
                  }
              });
          }
      });

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const yesterday = new Date(d);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          const event = this.getEvent(dateStr);
          if (event && event.type === DateEventType.CLOSED) continue; 

          let candidates = this.users.filter(user => {
            const status = this.getUserStatusOnDate(user.id, dateStr);
            return status === 'WORK';
          });

          for (const role of specialRolesToAssign) {
              const isRoleAssigned = this.shifts.some(s => s.date === dateStr && s.specialRoles.includes(role));
              
              if (!isRoleAssigned) {
                  const eligible = candidates.filter(u => {
                      if (!u.capabilities?.includes(role)) return false;
                      const userShift = this.shifts.find(s => s.userId === u.id && s.date === dateStr);
                      if (userShift && userShift.specialRoles.length > 0) return false;
                      return true;
                  });
                  
                  if (eligible.length > 0) {
                      eligible.sort((a, b) => {
                          const aHadYesterday = this.shifts.some(s => s.userId === a.id && s.date === yesterdayStr && s.specialRoles.includes(role));
                          const bHadYesterday = this.shifts.some(s => s.userId === b.id && s.date === yesterdayStr && s.specialRoles.includes(role));
                          if (aHadYesterday && !bHadYesterday) return 1; 
                          if (!aHadYesterday && bHadYesterday) return -1;
                          const countA = roleCounts[role][a.id] || 0;
                          const countB = roleCounts[role][b.id] || 0;
                          if (countA !== countB) return countA - countB;
                          return Math.random() - 0.5;
                      });

                      const selectedUser = eligible[0];
                      roleCounts[role][selectedUser.id] = (roleCounts[role][selectedUser.id] || 0) + 1;

                      const existingShiftIdx = this.shifts.findIndex(s => s.userId === selectedUser.id && s.date === dateStr);
                      if (existingShiftIdx >= 0) {
                          const s = this.shifts[existingShiftIdx];
                          s.specialRoles = [...s.specialRoles, role];
                          if (role === SPECIAL_ROLES.OPENING || role === SPECIAL_ROLES.LATE) {
                              if (s.station === StationDefault.FLOOR_CONTROL || s.station === StationDefault.REMOTE) {
                                  s.station = StationDefault.UNASSIGNED; 
                              }
                          }
                          s.isAutoGenerated = true;
                          await this.upsertShift(s); // Async Update
                      } else {
                          await this.upsertShift({
                              id: `${selectedUser.id}-${dateStr}`,
                              userId: selectedUser.id,
                              date: dateStr,
                              station: StationDefault.UNASSIGNED, 
                              specialRoles: [role],
                              isAutoGenerated: true
                          });
                      }
                  }
              }
          }
      }
  }

  async autoSchedule(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Clear auto-generated
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        // We iterate copy to allow mutation calls
        const shiftsOfDay = this.shifts.filter(s => s.date === dateStr && s.isAutoGenerated);
        for (const s of shiftsOfDay) {
            s.station = StationDefault.UNASSIGNED;
            await this.upsertShift(s);
        }
    }

    start.setTime(new Date(startDate).getTime());
    const priorityList = [
        '遠距', '遠班', '場控', 'MR3T', 'MR1.5T', 'CT', 'US1', 'US2', 'US3', 'US4', 'US',
        'BMD', 'BMD/DX', '大直', '技術支援', '行政'
    ];
    let activeStations = this.settings.stations.filter(s => s !== SYSTEM_OFF && s !== StationDefault.UNASSIGNED);
    activeStations = activeStations.sort((a, b) => {
        const idxA = priorityList.findIndex(p => a.includes(p));
        const idxB = priorityList.findIndex(p => b.includes(p));
        const valA = idxA === -1 ? 99 : idxA;
        const valB = idxB === -1 ? 99 : idxB;
        return valA - valB;
    });
    const requirements = this.settings.stationRequirements;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      
      const event = this.getEvent(dateStr);
      if (event && event.type === DateEventType.CLOSED) continue; 

      let candidates = this.users.filter(user => {
        const status = this.getUserStatusOnDate(user.id, dateStr);
        return status === 'WORK';
      });
      candidates = candidates.sort(() => Math.random() - 0.5);

      for (const station of activeStations) {
        const reqArray = requirements[station];
        const requiredCount = reqArray ? reqArray[dayOfWeek] : 0;
        if (requiredCount <= 0) continue;

        const currentAssigned = this.shifts.filter(s => s.date === dateStr && s.station === station);
        let assignedCount = currentAssigned.length;
        if (assignedCount >= requiredCount) continue; 

        const capableCandidates = candidates.filter(u => {
            if (!u.capabilities?.includes(station)) return false;
            const existingShift = this.shifts.find(s => s.userId === u.id && s.date === dateStr);
            if (existingShift && (existingShift.specialRoles.includes(SPECIAL_ROLES.OPENING) || existingShift.specialRoles.includes(SPECIAL_ROLES.LATE))) {
                if (station === StationDefault.FLOOR_CONTROL || station.includes('場控')) return false;
                if (station === StationDefault.REMOTE || station.includes('遠')) return false;
            }
            if (existingShift && existingShift.station !== StationDefault.UNASSIGNED && existingShift.station !== '未分配') {
                return false; 
            }
            return true;
        });

        for (const user of capableCandidates) {
            if (assignedCount >= requiredCount) break;
            const existingShiftIdx = this.shifts.findIndex(s => s.userId === user.id && s.date === dateStr);
            if (existingShiftIdx >= 0) {
                const s = this.shifts[existingShiftIdx];
                s.station = station;
                s.isAutoGenerated = true;
                await this.upsertShift(s);
            } else {
                await this.upsertShift({
                  id: `${user.id}-${dateStr}`,
                  userId: user.id,
                  date: dateStr,
                  station: station,
                  specialRoles: [], 
                  isAutoGenerated: true
                });
            }
            assignedCount++;
        }
      }

      // Phase 2: Unassigned
      const unassignedUsers = candidates.filter(u => {
          const s = this.shifts.find(shift => shift.userId === u.id && shift.date === dateStr);
          return !s || s.station === StationDefault.UNASSIGNED || s.station === '未分配';
      });

      if (unassignedUsers.length > 0) {
          const poolStations = [StationDefault.TECH_SUPPORT, StationDefault.ADMIN];
          const overflowStations = [...poolStations, StationDefault.FLOOR_CONTROL, ...activeStations];
          const uniqueOverflowStations = [...new Set(overflowStations)];
          
          for (const user of unassignedUsers) {
              const existingShift = this.shifts.find(s => s.userId === user.id && s.date === dateStr);
              const hasOpeningLate = existingShift && (existingShift.specialRoles.includes(SPECIAL_ROLES.OPENING) || existingShift.specialRoles.includes(SPECIAL_ROLES.LATE));

              const validStation = uniqueOverflowStations.find(st => {
                  const isCertified = user.capabilities?.includes(st);
                  const isLearning = user.learningCapabilities?.includes(st);
                  if (!isCertified && !isLearning) return false;
                  if (hasOpeningLate) {
                      if (st === StationDefault.FLOOR_CONTROL || st.includes('場控')) return false;
                      if (st === StationDefault.REMOTE || st.includes('遠')) return false;
                  }
                  const isPool = poolStations.some(p => st.includes(p)) || st.includes('技術支援') || st.includes('行政');
                  if (!isPool) {
                      const currentAssignments = this.shifts.filter(s => s.date === dateStr && s.station === st);
                      if (currentAssignments.length > 0) {
                          if (!isLearning) {
                              const hasCertifiedAssignee = currentAssignments.some(shift => {
                                  const assignee = this.users.find(u => u.id === shift.userId);
                                  return assignee && assignee.capabilities?.includes(st);
                              });
                              if (hasCertifiedAssignee) return false; 
                          }
                      }
                  }
                  return true;
              });

              if (validStation) {
                   const existingShiftIdx = this.shifts.findIndex(s => s.userId === user.id && s.date === dateStr);
                   if (existingShiftIdx >= 0) {
                       const s = this.shifts[existingShiftIdx];
                       s.station = validStation;
                       s.isAutoGenerated = true;
                       await this.upsertShift(s);
                   } else {
                       await this.upsertShift({
                        id: `${user.id}-${dateStr}`,
                        userId: user.id,
                        date: dateStr,
                        station: validStation,
                        specialRoles: [], 
                        isAutoGenerated: true
                      });
                   }
              }
          }
      }
    }
  }
}

export const db = new Store();