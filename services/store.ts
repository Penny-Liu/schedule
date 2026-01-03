
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
        cycleStartDate: '2025-11-06',
        stationDisplayOrder: []
    };
    currentUser: User | null = null;
    isLoaded: boolean = false;
    private listeners: (() => void)[] = [];

    constructor() {
        // We do not load in constructor anymore because it needs to be async
    }

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notifyListeners() {
        this.listeners.forEach(l => l());
    }

    // New method to fetch all data from Supabase
    async initializeData(force: boolean = false) {
        if (this.isLoaded && !force) return;

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
                console.log('Database empty, seeding init data...');
                this.users = MOCK_USERS;
                // Auto-seed Users
                const { error } = await supabase.from('users').insert(MOCK_USERS);
                if (error) console.error('Failed to seed users:', error);
            }

            if (shiftsRes.data) this.shifts = shiftsRes.data;
            if (leavesRes.data && leavesRes.data.length > 0) {
                this.leaves = leavesRes.data;
            } else {
                console.log('Database empty (leaves), seeding init data...');
                this.leaves = MOCK_LEAVES;
                // Auto-seed Leaves
                const { error } = await supabase.from('leaves').insert(MOCK_LEAVES);
                if (error) console.error('Failed to seed leaves:', error);
            }

            // Enhanced Settings Fetch: Try ID=1 first, then fallback to ANY row
            let finalSettingsData = null;

            if (settingsRes.data && settingsRes.data.data) {
                finalSettingsData = settingsRes.data.data;
            } else if (settingsRes.error && settingsRes.error.code === 'PGRST116') {
                // ID=1 not found. Try fetching ANY settings row (fallback)
                const fallbackRes = await supabase.from('settings').select('data').limit(1).single();
                if (fallbackRes.data && fallbackRes.data.data) {
                    console.log('[DEBUG] Found settings with non-standard ID. Using it.');
                    finalSettingsData = fallbackRes.data.data;
                }
            }

            if (finalSettingsData) {
                console.log('[DEBUG] Applied Settings:', finalSettingsData);
                this.settings = { ...this.settings, ...finalSettingsData };
            } else {
                console.warn('[DEBUG] No settings found in DB. Creating default (ID=1)...');
                if (!settingsRes.error || settingsRes.error.code === 'PGRST116') {
                    await this.saveSettings();
                }
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
        // Legacy fallback - Disabled for DB enforcement
        console.warn('Supabase fetch failed. Application requires DB connection.');
        this.users = [];
        this.isLoaded = true;
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

        if (error) {
            if (error.code === '42501') {
                console.warn('Settings auto-save skipped (Supabase RLS policy). Using defaults.');
            } else {
                console.error('Error saving settings:', error);
            }
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

    async changePassword(userId: string, newPass: string) {
        const u = this.users.find(u => u.id === userId);
        if (u) {
            u.password = newPass;
            u.mustChangePassword = false; // Clear flag
            // Sync DB
            await supabase.from('users').update({ password: newPass, mustChangePassword: false }).eq('id', userId);
        }
    }

    async resetPassword(userId: string) {
        const u = this.users.find(u => u.id === userId);
        if (u) {
            u.password = '1234';
            u.mustChangePassword = true; // Force change on next login
            // Sync DB
            await supabase.from('users').update({ password: '1234', mustChangePassword: true }).eq('id', userId);
        }
    }

    // Users
    getUsers() {
        if (!this.settings.userDisplayOrder || this.settings.userDisplayOrder.length === 0) {
            return this.users;
        }
        const orderMap = new Map(this.settings.userDisplayOrder.map((id, index) => [id, index]));
        // Sort users: ordered ones first, then others
        return [...this.users].sort((a, b) => {
            const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
            const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
            return orderA - orderB;
        });
    }

    async updateUserDisplayOrder(newOrder: string[]) {
        this.settings.userDisplayOrder = newOrder;
        await this.saveSettings();
    }

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
        this.notifyListeners();
    }

    // Leaves
    getLeaves() { return this.leaves; }

    async addLeave(leave: LeaveRequest) {
        this.leaves.push(leave);
        const { error } = await supabase.from('leaves').insert(leave);
        if (error) {
            console.error('Failed to insert leave:', error);
            // Optional: Rollback local state if needed, but for now just log
        }
        this.notifyListeners();
    }

    async updateLeaveTargetApproval(id: string, approvalStatus: 'AGREED' | 'REJECTED') {
        const leaveIndex = this.leaves.findIndex(l => l.id === id);
        if (leaveIndex === -1) return;

        const leave = this.leaves[leaveIndex];
        const newStatus = approvalStatus === 'REJECTED' ? LeaveStatus.REJECTED : leave.status;

        const updates = { targetApproval: approvalStatus, status: newStatus };
        this.leaves[leaveIndex] = { ...leave, ...updates };

        const { error } = await supabase.from('leaves').update(updates).eq('id', id);
        if (error) console.error('Failed to update leave target approval:', error);

        this.notifyListeners();
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
        this.notifyListeners();
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
                    isAutoGenerated: false,
                    isRoleAutoGenerated: false
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

    async toggleCycleConfirmation(cycleId: string, isConfirmed: boolean) {
        const cycleIndex = this.settings.cycles.findIndex(c => c.id === cycleId);
        if (cycleIndex >= 0) {
            this.settings.cycles[cycleIndex].isConfirmed = isConfirmed;
            await this.saveSettings();
        }
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

    // Batch Upsert
    async upsertShifts(shiftsToUpsert: Shift[]) {
        if (shiftsToUpsert.length === 0) return;

        // Update local state first
        shiftsToUpsert.forEach(shift => {
            const index = this.shifts.findIndex(s => s.userId === shift.userId && s.date === shift.date);
            if (index >= 0) {
                this.shifts[index] = shift;
            } else {
                this.shifts.push(shift);
            }
        });

        // Remote batch update
        const { error } = await supabase.from('shifts').upsert(shiftsToUpsert);
        if (error) console.error('Batch upsert error:', error);
    }

    // --- Auto Schedule Functions ---



    // Optimized Auto Schedule with Strict Priority and Gap Minimization

    // Fisher-Yates Shuffle Helper
    private shuffleArray<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    async autoSchedule(startDate: string, endDate: string) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        // 1. Clear ALL auto-generated shifts in the range first
        const shiftsToClear: Shift[] = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const shiftsOfDay = this.shifts.filter(s => s.date === dateStr && s.isAutoGenerated);
            shiftsOfDay.forEach(s => {
                s.station = StationDefault.UNASSIGNED;
                shiftsToClear.push(s);
            });
        }
        await this.upsertShifts(shiftsToClear);

        // Initialize Station Counts for Fairness
        const stationCounts: Record<string, Record<string, number>> = {};
        this.users.forEach(u => {
            stationCounts[u.id] = {};
            this.settings.stations.forEach(s => stationCounts[u.id][s] = 0);
        });

        // Pre-count existing assignments
        const shiftsInRange = this.getShifts(startDate, endDate);
        shiftsInRange.forEach(s => {
            if (s.station && s.station !== StationDefault.UNASSIGNED && s.station !== SYSTEM_OFF) {
                if (stationCounts[s.userId]) {
                    if (stationCounts[s.userId][s.station] !== undefined) {
                        stationCounts[s.userId][s.station]++;
                    } else {
                        stationCounts[s.userId][s.station] = 1;
                    }
                }
            }
        });

        // 2. Define Strict Priority Order
        const strictPriority = [
            '大直',
            '場控',
            '遠距', '遠班',
            'US', 'US1', 'US2', 'US3', 'US4',
            'MR', 'MR3T', 'MR1.5T',
            'CT',
            'BMD', 'BMD/DX',
            '技術支援',
            '行政'
        ];

        const requirements = this.settings.stationRequirements;

        start.setTime(new Date(startDate).getTime());

        // Iterate Day by Day
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayOfWeek = d.getDay();

            const event = this.getEvent(dateStr);
            if (event && event.type === DateEventType.CLOSED) continue;

            let slotsNeeded: string[] = [];
            const activeStations = this.settings.stations.filter(s => s !== SYSTEM_OFF && s !== StationDefault.UNASSIGNED);

            activeStations.forEach(st => {
                const reqCount = requirements[st] ? requirements[st][dayOfWeek] : 0;
                for (let i = 0; i < reqCount; i++) {
                    slotsNeeded.push(st);
                }
            });

            slotsNeeded.sort((a, b) => {
                const idxA = strictPriority.findIndex(p => a.includes(p));
                const idxB = strictPriority.findIndex(p => b.includes(p));
                const valA = idxA === -1 ? 999 : idxA;
                const valB = idxB === -1 ? 999 : idxB;
                return valA - valB;
            });

            const allWorkingUsers = this.users.filter(user => {
                const status = this.getUserStatusOnDate(user.id, dateStr);
                if (status !== 'WORK') return false;
                const existingShift = this.shifts.find(s => s.userId === user.id && s.date === dateStr);
                if (existingShift && !existingShift.isAutoGenerated && existingShift.station !== StationDefault.UNASSIGNED && existingShift.station !== '未分配') {
                    return false;
                }
                return true;
            });

            let bestAllocation: { userId: string, station: string }[] = [];
            let minUnfilledCount = Infinity;

            // Run 50 simulations (CPU bound, fast)
            for (let attempt = 0; attempt < 50; attempt++) {
                const currentAllocation: { userId: string, station: string }[] = [];
                const pool = [...allWorkingUsers].sort(() => Math.random() - 0.5);
                const slots = [...slotsNeeded];
                const unfilledSlots: string[] = [];

                // Fisher-Yates Shuffle for true randomness
                const shuffledPool = this.shuffleArray([...allWorkingUsers]);

                for (const slot of slots) {
                    // Apply Fairness Logic to ALL slots (previously only '場控')
                    // Sort by: Least assignments first, then Random order (preserved from shuffledPool)
                    const sortedPool = [...shuffledPool].sort((a, b) => {
                        const countA = stationCounts[a.id][slot] || 0;
                        const countB = stationCounts[b.id][slot] || 0;
                        return countA - countB; // Ascending: Less assignments -> Higher priority
                    });

                    const candidateIndex = sortedPool.findIndex(u => {
                        const isCertified = u.capabilities?.includes(slot);
                        // Explicitly exclude learners from auto-schedule
                        if (!isCertified) return false;

                        const existingShift = this.shifts.find(s => s.userId === u.id && s.date === dateStr);
                        if (existingShift) {
                            // STRICT RULE: If assigning Field Control, Remote, or Dazhi, User CANNOT have any Special Role
                            const roles = existingShift.specialRoles || [];
                            const hasAnySpecialRole = roles.length > 0;

                            // 1. Dazhi (大直) Strict Rules
                            // CANNOT have any special role
                            if (slot.includes('大直')) {
                                if (hasAnySpecialRole) return false;
                            }

                            // 2. Field Control (場控) Strict Rules
                            // CANNOT have any special role
                            if (slot.includes('場控')) {
                                if (hasAnySpecialRole) return false;
                            }

                            // 3. Remote (遠班/距) Strict Rules
                            // CANNOT have any special role
                            if (slot.includes('遠')) {
                                if (hasAnySpecialRole) return false;
                            }
                        }
                        return true;
                    });

                    if (candidateIndex >= 0) {
                        const winner = sortedPool[candidateIndex];
                        currentAllocation.push({ userId: winner.id, station: slot });

                        // Remove winner from shuffledPool so they can't be assigned again in this day
                        const winnerInMainPoolIdx = shuffledPool.findIndex(u => u.id === winner.id);
                        if (winnerInMainPoolIdx !== -1) {
                            shuffledPool.splice(winnerInMainPoolIdx, 1);
                        }
                    } else {
                        unfilledSlots.push(slot);
                    }
                }

                if (unfilledSlots.length < minUnfilledCount) {
                    minUnfilledCount = unfilledSlots.length;
                    bestAllocation = currentAllocation;
                    if (minUnfilledCount === 0 && attempt > 10) break;
                }
            }

            // Update Real Counts based on Best Allocation
            for (const alloc of bestAllocation) {
                if (stationCounts[alloc.userId] && stationCounts[alloc.userId][alloc.station] !== undefined) {
                    stationCounts[alloc.userId][alloc.station]++;
                }
            }

            // Apply Best Allocation (Batch)
            const dailyBatch: Shift[] = [];
            for (const alloc of bestAllocation) {
                const existingShiftIdx = this.shifts.findIndex(s => s.userId === alloc.userId && s.date === dateStr);
                if (existingShiftIdx >= 0) {
                    const s = { ...this.shifts[existingShiftIdx] }; // Clone
                    s.station = alloc.station;
                    s.isAutoGenerated = true;
                    dailyBatch.push(s);
                } else {
                    dailyBatch.push({
                        id: `${alloc.userId}-${dateStr}`,
                        userId: alloc.userId,
                        date: dateStr,
                        station: alloc.station,
                        specialRoles: [],
                        isAutoGenerated: true
                    });
                }
            }

            // Handle Unassigned (Leftovers)
            const assignedIds = bestAllocation.map(a => a.userId);
            const leftovers = allWorkingUsers.filter(u => !assignedIds.includes(u.id));

            for (const user of leftovers) {
                const existingShiftIdx = this.shifts.findIndex(s => s.userId === user.id && s.date === dateStr);
                if (existingShiftIdx >= 0) {
                    const s = { ...this.shifts[existingShiftIdx] };
                    s.station = StationDefault.UNASSIGNED;
                    s.isAutoGenerated = true;

                    // Dedupe: If already in dailyBatch (unlikely unless logic is flawed), update it
                    const inBatchIdx = dailyBatch.findIndex(b => b.id === s.id);
                    if (inBatchIdx >= 0) dailyBatch[inBatchIdx] = s;
                    else dailyBatch.push(s);
                }
            }

            await this.upsertShifts(dailyBatch);
        }
    }

    // --- Auto Schedule Special Roles ---
    async autoAssignSpecialRoles(startDate: string, endDate: string, targetRoles: string[]) {
        console.log('[Store] autoAssignSpecialRoles called', { startDate, endDate, targetRoles });
        const start = new Date(startDate);
        const end = new Date(endDate);
        const dateRange = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dateRange.push(d.toISOString().split('T')[0]);
        }

        // 0. Pre-Clear Auto-Generated Special Roles in Range
        // [MODIFIED] User Request: "Once task is assigned, do not clear".
        // We SKIP clearing logic to ensure manual/previous assignments are preserved.
        /*
        // FIX: Only clear roles that were AUTO-GENERATED (isRoleAutoGenerated === true)
        const shiftsToClear = this.getShifts(startDate, endDate).filter(s => s.isRoleAutoGenerated && s.specialRoles.length > 0);
        if (shiftsToClear.length > 0) {
            console.log(`[Store] Clearing ${shiftsToClear.length} auto-generated special role shifts...`);
            const clearedShifts = shiftsToClear.map(s => ({
                ...s,
                specialRoles: [], // Clear roles
                // If station is also unassigned, we might want to keep it as unassigned or delete? 
                // Currently just clearing roles.
            }));
            await this.upsertShifts(clearedShifts);
        }
        */

        // 1. Initialize Fairness Counters (Count existing special roles in this range)
        const roleCounts: Record<string, Record<string, number>> = {}; // { userId: { ROLE: count } }
        this.users.forEach(u => {
            roleCounts[u.id] = {};
            targetRoles.forEach(r => roleCounts[u.id][r] = 0);
        });

        // Pre-count existing assignments to ensure global fairness
        const shiftsInRange = this.getShifts(startDate, endDate);
        shiftsInRange.forEach(s => {
            s.specialRoles.forEach(r => {
                if (roleCounts[s.userId] && roleCounts[s.userId][r] !== undefined) {
                    roleCounts[s.userId][r]++;
                }
            });
        });

        // 2. Iterate each day
        for (const dateStr of dateRange) {
            // Shuffle roles to avoid priority bias
            const dailyRoles = [...targetRoles].sort(() => Math.random() - 0.5);

            for (const role of dailyRoles) {
                // Check if role is already filled for this day
                // STRICT RULE: Only 1 person per role per day
                const filledShifts = this.getShifts(dateStr, dateStr).filter(s => s.specialRoles.includes(role));
                if (filledShifts.length > 0) continue; // Already assigned

                // Find Candidates
                // Randomize candidates FIRST to ensure "Random Start" when counts are tied
                const shuffledUsers = [...this.users].sort(() => Math.random() - 0.5);

                const candidates = shuffledUsers.filter(u => {
                    // a. Must be WORKING
                    const status = this.getUserStatusOnDate(u.id, dateStr);
                    if (status !== 'WORK') return false;

                    // b. Must have Capability
                    if (u.capabilities && u.capabilities.length > 0 && !u.capabilities.includes(role)) {
                        return false;
                    }

                    const shift = this.getShifts(dateStr, dateStr).find(s => s.userId === u.id);

                    if (shift) {
                        // STRICT RULE: No Special Role Overlaps GENERALLY, BUT...
                        // EXCEPTION: 'Opening' (開機) and 'Assist' (輔班) CAN coexist.
                        if (shift.specialRoles.length > 0) {
                            const existing = shift.specialRoles;
                            const isOpening = existing.includes(SPECIAL_ROLES.OPENING);
                            const isAssist = existing.includes(SPECIAL_ROLES.ASSIST);
                            const targetIsOpening = role === SPECIAL_ROLES.OPENING;
                            const targetIsAssist = role === SPECIAL_ROLES.ASSIST;

                            // If existing is exactly [Opening] and target is Assist -> Allow for now
                            // If existing is exactly [Assist] and target is Opening -> Allow for now
                            // Note: We need to check if existing has OTHER roles interfering.
                            // Simplified: If existing has anything other than Opening/Assist, reject.
                            const hasOtherRoles = existing.some(r => r !== SPECIAL_ROLES.OPENING && r !== SPECIAL_ROLES.ASSIST);
                            if (hasOtherRoles) return false;

                            // Now check compatible pair
                            const isCompatible = (isOpening && targetIsAssist) || (isAssist && targetIsOpening);
                            if (!isCompatible) return false;

                            // If compatible, we allow it (and will append later)
                        }

                        // STRICT RULE: Conflict with specific Stations
                        // If manually assigned to '場控', '遠距', '大直', '遠班', CANNOT have special roles
                        const station = shift.station || '';
                        if (station.includes('場控') || station.includes('遠') || station.includes('大直')) {
                            return false;
                        }
                    }

                    return true;
                });

                if (candidates.length === 0) continue;

                // Sort by Fairness (Count) then Randomness
                // Since we already shuffled users, the random tie-breaker is implicit in the stable sort 
                // but we add it explicitly to be safe.
                candidates.sort((a, b) => {
                    const countA = roleCounts[a.id][role] || 0;
                    const countB = roleCounts[b.id][role] || 0;
                    // Lower count has PRIORITY (Ascending sort)
                    return countA - countB;
                });

                // Pick the winner
                const winner = candidates[0];

                // Assign
                const winnerShift = this.getShifts(dateStr, dateStr).find(s => s.userId === winner.id);
                if (winnerShift) {
                    const uniqueRoles = new Set([...(winnerShift.specialRoles || []), role]);
                    const newRoles = Array.from(uniqueRoles);

                    await this.upsertShift({
                        ...winnerShift,
                        specialRoles: newRoles,
                        isRoleAutoGenerated: true
                    });

                    // Update Count
                    roleCounts[winner.id][role]++;
                } else {
                    // Create new shift if strictly needed (unlikely if we filtered by WORK/Schedule existence)
                    await this.upsertShift({
                        id: `${winner.id}-${dateStr}`,
                        userId: winner.id,
                        date: dateStr,
                        station: StationDefault.UNASSIGNED,
                        specialRoles: [role],
                        isAutoGenerated: true, // It is auto-generated in general
                        isRoleAutoGenerated: true // Specific flag for Role
                    });
                    roleCounts[winner.id][role]++;
                }
            }
        }
        this.notifyListeners();
    }
}

export const db = new Store();
