
import { User, Shift, LeaveRequest, SystemSettings, UserRole, StaffGroup, StationDefault, SYSTEM_OFF, RosterCycle, LeaveStatus, LeaveType, Holiday, DateEventType, SPECIAL_ROLES } from '../types';
import { MOCK_USERS, MOCK_LEAVES } from './mockData';

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

  constructor() {
    this.load();
  }

  private load() {
    try {
      const storedUsers = localStorage.getItem('med_users');
      const storedShifts = localStorage.getItem('med_shifts');
      const storedLeaves = localStorage.getItem('med_leaves');
      const storedSettings = localStorage.getItem('med_settings');
      
      this.users = storedUsers ? JSON.parse(storedUsers) : MOCK_USERS;
      this.shifts = storedShifts ? JSON.parse(storedShifts) : [];
      this.leaves = storedLeaves ? JSON.parse(storedLeaves) : MOCK_LEAVES;
      
      if (storedSettings) {
        this.settings = JSON.parse(storedSettings);
        
        // Migration: Check if stationRequirements exists and is in correct format
        if (!this.settings.stationRequirements) {
            this.settings.stationRequirements = {};
        }
        
        // Migration: Check cycleStartDate
        if (!this.settings.cycleStartDate) {
            this.settings.cycleStartDate = '2024-01-01';
        }

        // Migration: Check display order
        if (!this.settings.stationDisplayOrder) {
            this.settings.stationDisplayOrder = [];
        }

        // Migration: Check if holidays exists and ensure 'type' exists
        if (!this.settings.holidays) {
            this.settings.holidays = [];
        } else {
            // Migration for old data without type
            this.settings.holidays = this.settings.holidays.map(h => ({
                ...h,
                type: h.type || DateEventType.NATIONAL
            }));
        }

        // Ensure every station has a 7-day array
        this.settings.stations.forEach(s => {
            if (s !== SYSTEM_OFF) {
                const req = this.settings.stationRequirements[s];
                // If undefined or old number format, reset to array of 1s
                if (!req || !Array.isArray(req)) {
                    const oldVal = typeof req === 'number' ? req : 1;
                    this.settings.stationRequirements[s] = [oldVal, oldVal, oldVal, oldVal, oldVal, oldVal, oldVal];
                }
            }
        });

      } else {
        // Initialize defaults
        const defaultStations = Object.values(StationDefault);
        const defaultRequirements: Record<string, number[]> = {};
        defaultStations.forEach(s => {
             if (s !== SYSTEM_OFF && s !== StationDefault.UNASSIGNED) {
                 defaultRequirements[s] = [1, 1, 1, 1, 1, 1, 1]; // Sun to Sat
             }
        });

        this.settings = {
          stations: defaultStations,
          cycles: [],
          holidays: [],
          stationRequirements: defaultRequirements,
          cycleStartDate: '2024-01-01',
          stationDisplayOrder: []
        };
      }
    } catch (e) {
      console.error("Failed to load data", e);
      this.users = MOCK_USERS;
      this.shifts = [];
      this.leaves = MOCK_LEAVES;
      this.settings = { stations: Object.values(StationDefault), cycles: [], holidays: [], stationRequirements: {}, cycleStartDate: '2024-01-01', stationDisplayOrder: [] };
    }
  }

  private save() {
    try {
      localStorage.setItem('med_users', JSON.stringify(this.users));
      localStorage.setItem('med_shifts', JSON.stringify(this.shifts));
      localStorage.setItem('med_leaves', JSON.stringify(this.leaves));
      localStorage.setItem('med_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.error("Failed to save data", e);
    }
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

  // Users
  getUsers() { return this.users; }
  addUser(user: User) {
    this.users.push(user);
    this.save();
  }
  updateUser(id: string, updates: Partial<User>) {
    this.users = this.users.map(u => u.id === id ? { ...u, ...updates } : u);
    this.save();
  }
  deleteUser(id: string) {
    this.users = this.users.filter(u => u.id !== id);
    this.save();
  }

  // Shifts
  getShifts(startDate: string, endDate: string) {
    // If no dates provided, return all (simplified for demo)
    if (!startDate && !endDate) return this.shifts;
    return this.shifts.filter(s => s.date >= startDate && s.date <= endDate);
  }
  
  upsertShift(shift: Shift) {
    const index = this.shifts.findIndex(s => s.userId === shift.userId && s.date === shift.date);
    if (index >= 0) {
      this.shifts[index] = shift;
    } else {
      this.shifts.push(shift);
    }
    this.save();
  }

  // Leaves
  getLeaves() { return this.leaves; }
  
  addLeave(leave: LeaveRequest) {
    // If it's a swap type, status starts as WAITING_FOR_TARGET
    if (leave.type === LeaveType.SWAP_SHIFT || leave.type === LeaveType.DUTY_SWAP) {
        leave.status = LeaveStatus.WAITING_FOR_TARGET;
    } else {
        leave.status = LeaveStatus.PENDING;
    }
    this.leaves.push(leave);
    this.save();
  }

  updateLeaveStatus(id: string, status: LeaveStatus, approverId: string) {
    const leaveIndex = this.leaves.findIndex(l => l.id === id);
    if (leaveIndex === -1) return;

    const leave = this.leaves[leaveIndex];
    
    // Update the leave record
    // Only update processedAt if it's a final state (Approved/Rejected)
    const isFinal = status === LeaveStatus.APPROVED || status === LeaveStatus.REJECTED;
    
    const updatedLeave = { 
        ...leave, 
        status, 
        approverId: isFinal ? approverId : undefined, 
        processedAt: isFinal ? new Date().toISOString() : undefined
    };
    this.leaves[leaveIndex] = updatedLeave;
    
    // LOGIC: If Approved, update shifts immediately
    if (status === LeaveStatus.APPROVED) {
        const startDate = new Date(leave.startDate);
        const endDate = new Date(leave.endDate);
        
        // Only loop once (usually) unless long leave
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];

            if (leave.type === LeaveType.PRE_SCHEDULED || leave.type === LeaveType.LONG_LEAVE) {
                // Requestor -> OFF
                this.upsertShift({
                    id: `${leave.userId}-${dateStr}`,
                    userId: leave.userId,
                    date: dateStr,
                    station: SYSTEM_OFF,
                    specialRoles: [],
                    isAutoGenerated: false
                });
            } else if (leave.type === LeaveType.CANCEL_LEAVE) {
                // Requestor -> Unassigned (Available for work)
                this.upsertShift({
                    id: `${leave.userId}-${dateStr}`,
                    userId: leave.userId,
                    date: dateStr,
                    station: StationDefault.UNASSIGNED, // Put back to pool
                    specialRoles: [],
                    isAutoGenerated: false
                });
            } else if (leave.type === LeaveType.SWAP_SHIFT) {
                // Requestor -> OFF
                this.upsertShift({
                    id: `${leave.userId}-${dateStr}`,
                    userId: leave.userId,
                    date: dateStr,
                    station: SYSTEM_OFF,
                    specialRoles: [],
                    isAutoGenerated: false
                });

                // Target -> Unassigned (Available for work, cancelling their OFF)
                if (leave.targetUserId) {
                    this.upsertShift({
                        id: `${leave.targetUserId}-${dateStr}`,
                        userId: leave.targetUserId,
                        date: dateStr,
                        station: StationDefault.UNASSIGNED,
                        specialRoles: [],
                        isAutoGenerated: false
                    });
                }
            } else if (leave.type === LeaveType.DUTY_SWAP) {
                // Special Role Swap (Opening/Late)
                // 1. Find the Shift of the Requestor (Who has the role)
                const requestorShift = this.shifts.find(s => s.userId === leave.userId && s.date === dateStr);
                // 2. Find the Shift of the Target (Who will take the role)
                const targetShift = this.shifts.find(s => s.userId === leave.targetUserId && s.date === dateStr);

                if (requestorShift && leave.targetUserId) {
                    // Identify which special roles the Requestor has
                    const rolesToSwap = requestorShift.specialRoles.filter(r => 
                        r === SPECIAL_ROLES.OPENING || r === SPECIAL_ROLES.LATE
                    );

                    // Remove roles from Requestor
                    const newRequestorRoles = requestorShift.specialRoles.filter(r => !rolesToSwap.includes(r));
                    this.upsertShift({
                        ...requestorShift,
                        specialRoles: newRequestorRoles,
                        isAutoGenerated: false // Manual override now
                    });

                    // Add roles to Target
                    // Ensure we create a shift object if target doesn't have one yet (unlikely if they are 'WORK')
                    const newTargetShift = targetShift ? { ...targetShift } : {
                        id: `${leave.targetUserId}-${dateStr}`,
                        userId: leave.targetUserId,
                        date: dateStr,
                        station: StationDefault.UNASSIGNED,
                        specialRoles: [],
                        isAutoGenerated: false
                    };
                    
                    newTargetShift.specialRoles = [...new Set([...newTargetShift.specialRoles, ...rolesToSwap])]; // Unique add
                    newTargetShift.isAutoGenerated = false;
                    this.upsertShift(newTargetShift);
                }
            }
        }
    }
    // If Rejected, we simply don't touch the shifts.

    this.save();
  }
  
  // Settings: Stations
  getStations() { return this.settings.stations; }
  getStationRequirements() { return this.settings.stationRequirements || {}; }
  
  addStation(name: string) {
    if (!this.settings.stations.includes(name)) {
      this.settings.stations.push(name);
      // Default requirement [1,1,1,1,1,1,1]
      this.settings.stationRequirements[name] = [1, 1, 1, 1, 1, 1, 1];
      this.save();
    }
  }
  removeStation(name: string) {
    this.settings.stations = this.settings.stations.filter(s => s !== name);
    delete this.settings.stationRequirements[name];
    this.save();
  }
  updateStationRequirement(name: string, dayIndex: number, count: number) {
    if (this.settings.stationRequirements[name]) {
        this.settings.stationRequirements[name][dayIndex] = count;
        this.save();
    }
  }

  // Settings: Display Order
  getStationDisplayOrder(): string[] {
      // Ensure we have a valid order list that contains all current stations AND special roles AND system rows
      const currentStations = this.settings.stations.filter(s => s !== SYSTEM_OFF && s !== StationDefault.UNASSIGNED);
      const specialRoles = [SPECIAL_ROLES.OPENING, SPECIAL_ROLES.LATE, SPECIAL_ROLES.ASSIST, SPECIAL_ROLES.SCHEDULER];
      const systemRows = [StationDefault.UNASSIGNED, SYSTEM_OFF]; // Explicitly track these so they can be reordered
      
      const allItems = [...new Set([...currentStations, ...specialRoles, ...systemRows])];
      const savedOrder = this.settings.stationDisplayOrder || [];

      // Merge: Keep saved order for valid items, append new/missing items at the end
      const mergedOrder = [
          ...savedOrder.filter(item => allItems.includes(item)), // Keep existing validity & order
          ...allItems.filter(item => !savedOrder.includes(item)) // Add new ones
      ];

      return mergedOrder;
  }

  updateStationDisplayOrder(newOrder: string[]) {
      this.settings.stationDisplayOrder = newOrder;
      this.save();
  }

  // Settings: Cycles
  getCycles() { return this.settings.cycles; }
  addCycle(cycle: RosterCycle) {
    this.settings.cycles.push(cycle);
    this.settings.cycles.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    this.save();
  }
  deleteCycle(id: string) {
    this.settings.cycles = this.settings.cycles.filter(c => c.id !== id);
    this.save();
  }

  getCycleStartDate() {
      return this.settings.cycleStartDate || '2024-01-01';
  }

  updateCycleStartDate(date: string) {
      this.settings.cycleStartDate = date;
      this.save();
  }

  // Settings: Holidays / Events
  getHolidays() { return this.settings.holidays || []; }
  
  addHoliday(holiday: Holiday) {
      if (!this.settings.holidays) this.settings.holidays = [];
      // Avoid duplicates
      if (!this.settings.holidays.some(h => h.date === holiday.date)) {
          this.settings.holidays.push(holiday);
          this.settings.holidays.sort((a, b) => a.date.localeCompare(b.date));
          this.save();
      }
  }
  
  removeHoliday(date: string) {
      if (this.settings.holidays) {
          this.settings.holidays = this.settings.holidays.filter(h => h.date !== date);
          this.save();
      }
  }

  // Helper to find special event for a date
  getEvent(date: string): Holiday | undefined {
      return this.settings.holidays?.find(h => h.date === date);
  }

  importTaiwanHolidays() {
      // Hardcoded list of Taiwan Holidays for 2025-2026
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
          { date: '2026-02-16', name: '除夕' }, // Approx
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
      this.save();
      return addedCount;
  }

  // 4-on-2-off Logic with Dynamic Start Date
  calculateBaseStatus(dateStr: string, groupId: StaffGroup): string | null {
    const referenceDate = new Date(this.settings.cycleStartDate || '2024-01-01');
    const targetDate = new Date(dateStr);
    
    // Ensure accurate day difference calculation
    // Reset time to midnight for both to avoid timezone/hour issues
    const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

    const diffTime = target.getTime() - ref.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
    
    // Handle negative difference if target is before ref
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

  // Helper: Check if user is OFF on a specific date (Considering Shifts, CLOSED events and Base Cycle)
  getUserStatusOnDate(userId: string, dateStr: string): 'WORK' | 'OFF' {
    const user = this.users.find(u => u.id === userId);
    if (!user) return 'OFF';

    // 0. Check Manual Shift Override (Highest Priority)
    const shift = this.shifts.find(s => s.userId === userId && s.date === dateStr);
    if (shift) {
        return shift.station === SYSTEM_OFF ? 'OFF' : 'WORK';
    }

    // 1. Check System Event (CLINIC CLOSED)
    const event = this.getEvent(dateStr);
    if (event && event.type === DateEventType.CLOSED) {
        return 'OFF';
    }

    // 2. Check Natural Cycle
    const baseStatus = this.calculateBaseStatus(dateStr, user.groupId);
    if (baseStatus === SYSTEM_OFF) {
        return 'OFF';
    }

    // 3. Check Approved Leaves
    const approvedLeave = this.leaves.find(l => 
        l.userId === userId && 
        l.status === LeaveStatus.APPROVED &&
        dateStr >= l.startDate && 
        dateStr <= l.endDate
    );
    if (approvedLeave) return 'OFF';

    return 'WORK';
  }

  // Helper: Get all users who are OFF on a specific date
  getUsersOffOnDate(dateStr: string): User[] {
    return this.users.filter(user => this.getUserStatusOnDate(user.id, dateStr) === 'OFF');
  }

  // Helper: Get all users who are WORKING on a specific date
  getUsersWorkingOnDate(dateStr: string): User[] {
    return this.users.filter(user => this.getUserStatusOnDate(user.id, dateStr) === 'WORK');
  }

  // --- Dedicated Auto Assign for Special Roles (Opening/Late) ---
  // Updated: Prevents consecutive days and ensures fairness
  autoAssignSpecialRoles(startDate: string, endDate: string) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const specialRolesToAssign = [SPECIAL_ROLES.OPENING, SPECIAL_ROLES.LATE];

      // 1. Calculate Historical Load for Fairness
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

      // Loop through each day in range
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          
          // Calculate yesterday string for consecutive check
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
                      // SORTING LOGIC: 
                      // 1. Avoid Consecutive (High Penalty)
                      // 2. Average Load (Fairness)
                      // 3. Random
                      eligible.sort((a, b) => {
                          // Check if A or B had this role YESTERDAY
                          const aHadYesterday = this.shifts.some(s => s.userId === a.id && s.date === yesterdayStr && s.specialRoles.includes(role));
                          const bHadYesterday = this.shifts.some(s => s.userId === b.id && s.date === yesterdayStr && s.specialRoles.includes(role));

                          if (aHadYesterday && !bHadYesterday) return 1; // A bad, B good -> B first
                          if (!aHadYesterday && bHadYesterday) return -1; // A good, B bad -> A first

                          // Check Load
                          const countA = roleCounts[role][a.id] || 0;
                          const countB = roleCounts[role][b.id] || 0;
                          if (countA !== countB) return countA - countB;
                          
                          // Random
                          return Math.random() - 0.5;
                      });

                      const selectedUser = eligible[0];
                      roleCounts[role][selectedUser.id] = (roleCounts[role][selectedUser.id] || 0) + 1;

                      const existingShiftIdx = this.shifts.findIndex(s => s.userId === selectedUser.id && s.date === dateStr);
                      if (existingShiftIdx >= 0) {
                          const s = this.shifts[existingShiftIdx];
                          s.specialRoles = [...s.specialRoles, role];
                          // If they now have Opening/Late, clear conflicting stations if assigned
                          if (role === SPECIAL_ROLES.OPENING || role === SPECIAL_ROLES.LATE) {
                              if (s.station === StationDefault.FLOOR_CONTROL || s.station === StationDefault.REMOTE) {
                                  s.station = StationDefault.UNASSIGNED; 
                              }
                          }
                          s.isAutoGenerated = true; 
                      } else {
                          this.shifts.push({
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
      this.save();
  }

  // Auto Schedule Function (For Stations Only)
  // Updated: Ensures no unassigned people if possible, AND prevents duplicate certified staff
  autoSchedule(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // 1. Clear existing Auto-Generated Shifts in this range to allow reshuffling
    // We do NOT clear manual locks (isAutoGenerated !== true) or Special Roles logic here
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        this.shifts.forEach(s => {
            if (s.date === dateStr && s.isAutoGenerated) {
                // Keep station if user manually locked? (Current logic assumes isAutoGenerated means fully auto)
                // If we want "change every time", we must reset the station.
                // But preserve special roles!
                s.station = StationDefault.UNASSIGNED;
            }
        });
    }

    // Reset date for assignment loop
    start.setTime(new Date(startDate).getTime());

    // Sort stations by Priority (Scarcity logic implies filling hard stations first)
    const priorityList = [
        '遠距', '遠班', 
        '場控', 
        'MR3T', 
        'MR1.5T', 
        'CT', 
        'US1', 'US2', 'US3', 'US4', 'US',
        'BMD', 'BMD/DX',
        '大直', 
        '技術支援', 
        '行政'
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

    // Loop through each day in range
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      
      const event = this.getEvent(dateStr);
      if (event && event.type === DateEventType.CLOSED) continue; 

      // Identify Available Candidates for the day
      let candidates = this.users.filter(user => {
        const status = this.getUserStatusOnDate(user.id, dateStr);
        return status === 'WORK';
      });

      // Shuffle candidates for Station Assignment to distribute popular stations fairly and create randomness
      candidates = candidates.sort(() => Math.random() - 0.5);

      // --- PHASE 1: FILL REQUIREMENTS ---
      // This phase respects `requiredCount`. If manager sets requirement to 1, only 1 gets assigned.
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
            
            // Constraint: Opening/Late CANNOT do Floor Control or Remote
            if (existingShift && (existingShift.specialRoles.includes(SPECIAL_ROLES.OPENING) || existingShift.specialRoles.includes(SPECIAL_ROLES.LATE))) {
                if (station === StationDefault.FLOOR_CONTROL || station.includes('場控')) return false;
                if (station === StationDefault.REMOTE || station.includes('遠')) return false;
            }

            // Check if user already has a station assigned
            if (existingShift && existingShift.station !== StationDefault.UNASSIGNED && existingShift.station !== '未分配') {
                return false; 
            }
            return true;
        });

        for (const user of capableCandidates) {
            if (assignedCount >= requiredCount) break;

            const existingShiftIdx = this.shifts.findIndex(s => s.userId === user.id && s.date === dateStr);
            
            if (existingShiftIdx >= 0) {
                this.shifts[existingShiftIdx].station = station;
                this.shifts[existingShiftIdx].isAutoGenerated = true;
            } else {
                this.shifts.push({
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

      // --- PHASE 2: ELIMINATE UNASSIGNED (No blanks) ---
      // Try to fit unassigned people into ANY station they can do, ignoring limits if necessary.
      // Constraint Added: Unless learning, do not put > 1 person in same station (except Pools).
      
      const unassignedUsers = candidates.filter(u => {
          const s = this.shifts.find(shift => shift.userId === u.id && shift.date === dateStr);
          return !s || s.station === StationDefault.UNASSIGNED || s.station === '未分配';
      });

      if (unassignedUsers.length > 0) {
          // Define pool stations that allow multiple certified staff
          const poolStations = [StationDefault.TECH_SUPPORT, StationDefault.ADMIN];
          
          // Prioritize overflow targets: Tech Support/Admin first, then others
          const overflowStations = [...poolStations, StationDefault.FLOOR_CONTROL, ...activeStations];
          const uniqueOverflowStations = [...new Set(overflowStations)];
          
          for (const user of unassignedUsers) {
              const existingShift = this.shifts.find(s => s.userId === user.id && s.date === dateStr);
              const hasOpeningLate = existingShift && (existingShift.specialRoles.includes(SPECIAL_ROLES.OPENING) || existingShift.specialRoles.includes(SPECIAL_ROLES.LATE));

              const validStation = uniqueOverflowStations.find(st => {
                  const isCertified = user.capabilities?.includes(st);
                  const isLearning = user.learningCapabilities?.includes(st);

                  // 1. Capability Check (Certified OR Learning)
                  if (!isCertified && !isLearning) return false;
                  
                  // 2. Role Constraint (Opening/Late != Remote/FloorControl)
                  if (hasOpeningLate) {
                      if (st === StationDefault.FLOOR_CONTROL || st.includes('場控')) return false;
                      if (st === StationDefault.REMOTE || st.includes('遠')) return false;
                  }

                  // 3. "No > 1 Certified Person" Constraint
                  // Check if this station is a Pool Station (Allow multiples)
                  const isPool = poolStations.some(p => st.includes(p)) || st.includes('技術支援') || st.includes('行政');

                  if (!isPool) {
                      const currentAssignments = this.shifts.filter(s => s.date === dateStr && s.station === st);
                      if (currentAssignments.length > 0) {
                          // Station is occupied.
                          // Allow if user is Learning (Learner can join)
                          if (!isLearning) {
                              // User is Certified.
                              // Check if there is already a Certified person.
                              const hasCertifiedAssignee = currentAssignments.some(shift => {
                                  const assignee = this.users.find(u => u.id === shift.userId);
                                  return assignee && assignee.capabilities?.includes(st);
                              });
                              
                              if (hasCertifiedAssignee) return false; // Block 2nd certified person
                          }
                      }
                  }
                  
                  return true;
              });

              if (validStation) {
                   const existingShiftIdx = this.shifts.findIndex(s => s.userId === user.id && s.date === dateStr);
                   if (existingShiftIdx >= 0) {
                       this.shifts[existingShiftIdx].station = validStation;
                       this.shifts[existingShiftIdx].isAutoGenerated = true;
                   } else {
                       this.shifts.push({
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
    
    this.save();
  }
}
