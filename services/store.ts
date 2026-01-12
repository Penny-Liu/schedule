
import { User, Shift, LeaveRequest, SystemSettings, StationDefault, SYSTEM_OFF, RosterCycle, DateEventType, Holiday, LeaveStatus, LeaveType, StaffGroup, SPECIAL_ROLES, CycleAnchor } from '../types';
import { MOCK_USERS, MOCK_LEAVES } from './mockData';
import { supabase } from './supabaseClient';

const SCHEDULE_STORAGE_KEY = 'radiology_schedule_data';

// Helper: Get Local ISO String YYYY-MM-DD
const toLocalISOString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

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
        cycleAnchors: [],
        stationDisplayOrder: []
    };
    currentUser: User | null = null;
    isLoaded: boolean = false;
    private listeners: (() => void)[] = [];
    private settingsRowId: string | number = 1; // Default to 1, but dynamic
    private subscription: any = null; // Realtime subscription

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

    // Helper: Fetch all shifts with pagination to bypass 1000-row limit
    private async fetchAllShifts() {
        let allShifts: any[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        let lastError = null;

        while (hasMore) {
            const { data, error } = await supabase
                .from('shifts')
                .select('*')
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) {
                console.error('Error fetching shifts page:', page, error);
                lastError = error;
                hasMore = false; // Stop on error
            } else if (data) {
                allShifts = [...allShifts, ...data];
                if (data.length < pageSize) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                hasMore = false;
            }
        }

        console.log(`[Pagination] Total shifts fetched: ${allShifts.length}`);
        return { data: allShifts, error: lastError };
    }

    // New method to fetch all data from Supabase
    async initializeData(force: boolean = false) {
        if (this.isLoaded && !force) return;

        // Setup Realtime Subscription
        this.setupRealtimeSubscription();

        try {
            console.log('Fetching data from Supabase...');

            const [usersRes, shiftsRes, leavesRes, settingsRes] = await Promise.all([
                supabase.from('users').select('*'),
                this.fetchAllShifts(),
                supabase.from('leaves').select('*'),
                supabase.from('settings').select('id, data').eq('id', 1).single()
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

            if (shiftsRes.data) {
                // Deduplicate shifts: Prioritize valid IDs and content
                const uniqueShiftsMap = new Map();
                shiftsRes.data.forEach(s => {
                    const key = `${s.userId}-${s.date}`;
                    const existing = uniqueShiftsMap.get(key);

                    if (!existing) {
                        uniqueShiftsMap.set(key, s);
                    } else {
                        // Conflict Resolution Strategy:
                        // 1. Prefer Good IDs (no spaces) over Bad IDs
                        const isExistingIdBad = existing.id.includes(' ');
                        const isNewIdBad = s.id.includes(' ');

                        // If existing is bad and new is good => Replace
                        if (isExistingIdBad && !isNewIdBad) {
                            uniqueShiftsMap.set(key, s);
                            return;
                        }

                        // If both are good (or both bad), Prefer Content over Empty/Unassigned
                        if (existing.station === 'Unassigned' || existing.station === '未分配' || !existing.station) {
                            if (s.station && s.station !== 'Unassigned' && s.station !== '未分配') {
                                uniqueShiftsMap.set(key, s);
                            }
                        }
                    }
                });
                this.shifts = Array.from(uniqueShiftsMap.values());
            }
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
                this.settingsRowId = settingsRes.data.id; // Capture ID
            } else if (settingsRes.error && settingsRes.error.code === 'PGRST116') {
                // ID=1 not found. Try fetching ANY settings row (fallback)
                const fallbackRes = await supabase.from('settings').select('id, data').limit(1).single();
                if (fallbackRes.data && fallbackRes.data.data) {
                    console.log('[DEBUG] Found settings with non-standard ID. Using it.');
                    finalSettingsData = fallbackRes.data.data;
                    this.settingsRowId = fallbackRes.data.id; // Capture ID
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

    // [New] Cleanup Tool for Duplicates
    async cleanupDuplicateShifts() {
        console.log('Starting DB Cleanup...');
        try {
            // 1. Fetch ALL raw shifts
            const { data: allShifts, error } = await supabase.from('shifts').select('*');
            if (error || !allShifts) throw new Error('Fetch failed');

            // 2. Identify Duplicates
            const uniqueMap = new Map<string, Shift>();
            const idsToDelete: string[] = [];

            allShifts.forEach((s: Shift) => {
                const key = `${s.userId}-${s.date}`;
                const existing = uniqueMap.get(key);

                if (!existing) {
                    uniqueMap.set(key, s);
                } else {
                    // Conflict: Keep the "Better" one
                    // Prioritize: 1. Valid UUID > 'userId-date'
                    //            2. Content (Station) > Unassigned
                    //            3. Newer (if timestamps existed, but we don't have them reliably here)
                    const isExistingUUID = existing.id.length > 25;
                    const isNewUUID = s.id.length > 25;
                    const isExistingContent = existing.station && existing.station !== 'Unassigned' && existing.station !== '未分配' && existing.station !== 'SystemOff';
                    const isNewContent = s.station && s.station !== 'Unassigned' && s.station !== '未分配' && s.station !== 'SystemOff';

                    let keepNew = false;

                    if (isNewUUID && !isExistingUUID) keepNew = true;
                    else if (isNewUUID === isExistingUUID) {
                        if (isNewContent && !isExistingContent) keepNew = true;
                    }

                    if (keepNew) {
                        idsToDelete.push(existing.id);
                        uniqueMap.set(key, s);
                    } else {
                        idsToDelete.push(s.id);
                    }
                }
            });

            console.log(`Found ${idsToDelete.length} duplicates to delete.`);

            // 3. Delete Bad IDs
            if (idsToDelete.length > 0) {
                // Batch delete in chunks of 100 to avoid URL limits
                const chunkSize = 100;
                for (let i = 0; i < idsToDelete.length; i += chunkSize) {
                    const chunk = idsToDelete.slice(i, i + chunkSize);
                    const { error: delError } = await supabase.from('shifts').delete().in('id', chunk);
                    if (delError) console.error('Delete chunk failed:', delError);
                }
            }

            // 4. Refresh Data
            await this.initializeData(true);
            return idsToDelete.length;

        } catch (e) {
            console.error('Cleanup failed:', e);
            throw e;
        }
    }

    // [New] Force Clear Data for Specific Month (Nuclear Option)
    async forceClearMonth(yearMonth: string) {
        // yearMonth format: "YYYY-MM"
        console.log(`Force Clearing Month: ${yearMonth}`);
        try {
            const [year, month] = yearMonth.split('-').map(Number);
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            // Calculate end date (last day of month)
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

            console.log(`Deleting shifts from ${startDate} to ${endDate}...`);

            // Delete ALL shifts in this range
            const { error: delError } = await supabase
                .from('shifts')
                .delete()
                .gte('date', startDate)
                .lte('date', endDate);

            if (delError) {
                console.error('Force clear failed:', delError);
                throw delError;
            }

            // Refresh Data
            await this.initializeData(true);
            return true;
        } catch (e) {
            console.error('Force clear exception:', e);
            throw e;
        }
    }

    // Realtime Listener Setup
    private setupRealtimeSubscription() {
        if (this.subscription) return;

        this.subscription = supabase
            .channel('public:shifts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, (payload) => {
                this.handleRealtimeShiftUpdate(payload);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[Realtime] Connected to shifts table');
                }
            });
    }

    private handleRealtimeShiftUpdate(payload: any) {
        const { eventType, new: newRecord, old: oldRecord } = payload;

        if (eventType === 'INSERT') {
            const exists = this.shifts.some(s => s.id === newRecord.id);
            if (!exists) {
                // Check if we have a "pending" shift for this slot (optimistic update with different ID)
                const slotIndex = this.shifts.findIndex(s => s.userId === newRecord.userId && s.date === newRecord.date);
                if (slotIndex >= 0) {
                    // Update the existing slot with the authoritative record from DB
                    this.shifts[slotIndex] = newRecord as Shift;
                } else {
                    this.shifts.push(newRecord as Shift);
                }
                this.notifyListeners();
            }
        } else if (eventType === 'UPDATE') {
            const index = this.shifts.findIndex(s => s.id === newRecord.id);
            if (index !== -1) {
                this.shifts[index] = newRecord as Shift;
                this.notifyListeners();
            }
        } else if (eventType === 'DELETE') {
            const idToDelete = oldRecord.id;
            this.shifts = this.shifts.filter(s => s.id !== idToDelete);
            this.notifyListeners();
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
        if (!this.settings.stationDisplayOrder) this.settings.stationDisplayOrder = [];
        if (!this.settings.cycleAnchors) this.settings.cycleAnchors = [];
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
            .upsert({ id: this.settingsRowId, data: this.settings }); // Use captured ID

        if (error) {
            console.error('Error saving settings:', error);
            if (error.code === '42501') {
                console.warn('Settings auto-save skipped (Supabase RLS policy). Using defaults.');
            }
        }
        return { error };
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

    async updateUserPassword(userId: string, newPass: string) {
        const u = this.users.find(u => u.id === userId);
        if (u) {
            u.password = newPass;
            u.mustChangePassword = false;
            await supabase.from('users').update({ password: newPass, mustChangePassword: false }).eq('id', userId);
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
        // 1. Update Local State: Optimistic Update
        const otherIndices: number[] = [];
        let foundIndex = -1;

        // Clean local state first
        for (let i = 0; i < this.shifts.length; i++) {
            const s = this.shifts[i];
            if (s.userId === shift.userId && s.date === shift.date) {
                if (foundIndex === -1) {
                    foundIndex = i;
                } else {
                    otherIndices.push(i);
                }
            }
        }
        for (let i = otherIndices.length - 1; i >= 0; i--) {
            this.shifts.splice(otherIndices[i], 1);
        }

        if (foundIndex >= 0) {
            this.shifts[foundIndex] = shift;
        } else {
            this.shifts.push(shift);
        }

        this.notifyListeners(); // Notify immediately for UI responsiveness

        // 2. Remote Sync: Safer 'Update or Insert' Strategy
        try {
            // A. Check for existing record(s)
            const { data: existing, error: fetchError } = await supabase
                .from('shifts')
                .select('id')
                .eq('userId', shift.userId)
                .eq('date', shift.date);

            if (fetchError) throw fetchError;

            let targetId: string | null = null;

            if (existing && existing.length > 0) {
                // Case: Exists -> Update
                // Use the first ID found
                targetId = existing[0].id;

                // Cleanup: If multiple records exist (duplicates), delete the extras
                if (existing.length > 1) {
                    // console.warn('Cleaning up duplicate shifts on save:', existing.length);
                    const idsToDelete = existing.slice(1).map(e => e.id);
                    await supabase.from('shifts').delete().in('id', idsToDelete);
                }

                // Perform Update
                // Important: Ensure we don't accidentally change the ID
                const { error: updateError } = await supabase
                    .from('shifts')
                    .update({ ...shift, id: targetId })
                    .eq('id', targetId);

                if (updateError) throw updateError;

            } else {
                // Case: New -> Insert
                // Generate a proper UUID for the DB
                const newId = crypto.randomUUID();
                targetId = newId;

                const { error: insertError } = await supabase
                    .from('shifts')
                    .insert({ ...shift, id: newId });

                if (insertError) throw insertError;
            }

            // 3. Sync Local ID to match DB ID
            // This is crucial so future updates target the correct DB record
            const finalIndex = this.shifts.findIndex(s => s.userId === shift.userId && s.date === shift.date);
            if (finalIndex >= 0 && targetId) {
                this.shifts[finalIndex].id = targetId;
            }

        } catch (err: any) {
            console.error('Persistence failed:', err);
            // Ideally we should rollback local state or show an error
            return { error: err };
        }

        return { error: null };
    }

    async deleteShift(userId: string, date: string) {
        // 1. Local Update: Remove from local array
        this.shifts = this.shifts.filter(s => !(s.userId === userId && s.date === date));
        this.notifyListeners();

        // 2. Remote Update: Delete from DB
        try {
            const { error } = await supabase
                .from('shifts')
                .delete()
                .eq('userId', userId)
                .eq('date', date);

            if (error) throw error;
        } catch (err) {
            console.error('Failed to delete shift:', err);
        }
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

    async deleteLeave(id: string) {
        this.leaves = this.leaves.filter(l => l.id !== id);
        const { error } = await supabase.from('leaves').delete().eq('id', id);
        if (error) {
            console.error('Failed to delete leave:', error);
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
            const dateStr = toLocalISOString(d);

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
                // User Request: Cancel Leave should set status to "Unassigned" (Working), NOT delete the record.
                await this.upsertShift({
                    id: `${leave.userId}-${dateStr}`,
                    userId: leave.userId,
                    date: dateStr,
                    station: StationDefault.UNASSIGNED,
                    specialRoles: [],
                    isAutoGenerated: false
                });
            } else if (leave.type === LeaveType.ASK_LEAVE) {
                // One-Way Substitution (Old Swap Shift Logic)
                // Requestor (Work) -> OFF
                await this.upsertShift({
                    id: `${leave.userId}-${dateStr}`,
                    userId: leave.userId,
                    date: dateStr,
                    station: SYSTEM_OFF,
                    specialRoles: [],
                    isAutoGenerated: false
                });
                if (leave.targetUserId) {
                    // Target (Off) -> Work (Unassigned or Take Spot)
                    await this.upsertShift({
                        id: `${leave.targetUserId}-${dateStr}`,
                        userId: leave.targetUserId,
                        date: dateStr,
                        station: StationDefault.UNASSIGNED,
                        specialRoles: [],
                        isAutoGenerated: false
                    });
                }
            } else if (leave.type === LeaveType.SWAP_SHIFT) {
                // Two-Way Swap (Exchange Shifts on Two Dates)
                // Date 1 (startDate): Requestor Work->Off, Target Off->Work
                // Date 2 (returnDate): Requestor Off->Work, Target Work->Off

                // 1. Handle startDate (Requestor OFF, Target WORK)
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

                // 2. Handle returnDate (Requestor WORK, Target OFF)
                if (leave.returnDate) {
                    // Only process returnDate loop once (since outer loop iterates startDate...endDate, but Swap is usually point-to-point)
                    // If startDate == endDate, we handle returnDate explicitly here.
                    // IMPORTANT: The outer loop iterates d from start to end. 
                    // SWAP_SHIFT usually implies just single distinct days, but if user picked a range, it gets complex.
                    // Assuming UI enforces single day for startDate.

                    // We need to upsert for returnDate as well.
                    const rDate = leave.returnDate;

                    // Requestor -> WORK
                    await this.upsertShift({
                        id: `${leave.userId}-${rDate}`,
                        userId: leave.userId,
                        date: rDate,
                        station: StationDefault.UNASSIGNED,
                        specialRoles: [],
                        isAutoGenerated: false
                    });

                    // Target -> OFF
                    if (leave.targetUserId) {
                        await this.upsertShift({
                            id: `${leave.targetUserId}-${rDate}`,
                            userId: leave.targetUserId,
                            date: rDate,
                            station: SYSTEM_OFF,
                            specialRoles: [],
                            isAutoGenerated: false
                        });
                    }
                }
            } else if (leave.type === LeaveType.DUTY_SWAP) {
                // Logic for Duty Swap
                // 1. Fetch FRESH data for both users to ensure we don't overwrite recent changes
                let requestorShift = this.shifts.find(s => s.userId === leave.userId && s.date === dateStr);
                let targetShift = this.shifts.find(s => s.userId === leave.targetUserId && s.date === dateStr);

                // Fetch from DB to be absolutely sure (Optional but recommended for stability)
                const { data: dbShifts } = await supabase
                    .from('shifts')
                    .select('*')
                    .in('userId', [leave.userId, leave.targetUserId!])
                    .eq('date', dateStr);

                if (dbShifts) {
                    const dbReq = dbShifts.find(s => s.userId === leave.userId);
                    const dbTarget = dbShifts.find(s => s.userId === leave.targetUserId);
                    // Use DB data if available, falling back to local
                    if (dbReq) requestorShift = dbReq;
                    if (dbTarget) targetShift = dbTarget;
                }

                if (requestorShift && leave.targetUserId) {
                    const rolesToSwap = requestorShift.specialRoles.filter(r =>
                        leave.roleToSwap ? r === leave.roleToSwap : Object.values(SPECIAL_ROLES).includes(r)
                    );

                    // A. Remove role from Requestor (Preserve other roles/station)
                    const newRequestorRoles = requestorShift.specialRoles.filter(r => !rolesToSwap.includes(r));
                    await this.upsertShift({
                        ...requestorShift,
                        specialRoles: newRequestorRoles,
                        isAutoGenerated: false
                    });

                    // B. Add role to Target (Preserve target's station/schedule!)
                    const newTargetShift = targetShift ? { ...targetShift } : {
                        id: `${leave.targetUserId}-${dateStr}`,
                        userId: leave.targetUserId,
                        date: dateStr,
                        station: StationDefault.UNASSIGNED,
                        specialRoles: [],
                        isAutoGenerated: false
                    };

                    newTargetShift.specialRoles = [...new Set([...newTargetShift.specialRoles, ...rolesToSwap])];
                    // Ensure we don't accidentally mark as auto
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
        const currentStations = this.settings.stations.filter(s => s !== StationDefault.UNASSIGNED);
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

    // Settings: Cycle Anchors (Reset Points)
    getCycleAnchors() {
        return this.settings.cycleAnchors || [];
    }

    async addCycleAnchor(effectiveDate: string, anchorDate: string) {
        if (!this.settings.cycleAnchors) this.settings.cycleAnchors = [];
        // Remove existing anchor for same effectiveDate if exists
        this.settings.cycleAnchors = this.settings.cycleAnchors.filter(a => a.effectiveDate !== effectiveDate);
        this.settings.cycleAnchors.push({ effectiveDate, anchorDate });
        // Sort by effective date descending (newest first)
        this.settings.cycleAnchors.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

        const { error } = await this.saveSettings();
        if (error) throw error;
    }

    async removeCycleAnchor(effectiveDate: string) {
        if (!this.settings.cycleAnchors) return;
        this.settings.cycleAnchors = this.settings.cycleAnchors.filter(a => a.effectiveDate !== effectiveDate);

        const { error } = await this.saveSettings();
        if (error) throw error;
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

        const today = toLocalISOString(new Date());
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

    // Base Status Logic (Modified to include today check)
    calculateBaseStatus(dateStr: string, groupId: string): string | null {




        // 1. Find the applicable anchor
        // We want the LATEST anchor where effectiveDate <= dateStr
        // Since anchors are sorted descending by effectiveDate, we find the first one that matches.
        const anchors = this.settings.cycleAnchors || [];
        const applicableAnchor = anchors.find(a => dateStr >= a.effectiveDate);

        let refDateStr = this.settings.cycleStartDate || '2024-01-01';

        // If an anchor is found, use it. The anchor's 'anchorDate' acts as the NEW 'cycleStartDate'.
        // BUT, we must ensure the calculation treats 'anchorDate' as Day 0 (or Day 1) relative to itself.
        // Actually, if we just swap 'referenceDate', the math `target - ref` works perfectly.
        if (applicableAnchor) {
            refDateStr = applicableAnchor.anchorDate;
        }

        const referenceDate = new Date(refDateStr);
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
        const user = this.users.find(u => u.id === userId);
        if (!user) return 'OFF';

        const shift = this.shifts.find(s => s.userId === userId && s.date === dateStr);
        // Explicit override: If assigned to OFF, it's OFF.
        if (shift && shift.station === SYSTEM_OFF) {
            return 'OFF';
        }

        // Explicit override: If record exists and NOT OFF, it is WORK.
        // Since we now use "Nuclear Persistence" (Delete-then-Insert), any record here is intentional.
        // So even "Unassigned" means the user was explicitly set to be available/working.
        if (shift) {
            return 'WORK';
        }

        // If no shift record at all: Check underlying status
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

    // New: Safer "Complete" button logic - Batch Upsert
    // Does NOT delete data. Only overwrites/adds.
    async commitShiftsForRange(startDate: string, endDate: string, latestShifts?: Shift[]) {
        console.log(`[Sync] Committing shifts for range ${startDate} to ${endDate}...`);

        // 1. Get local shifts to save
        const sourceShifts = latestShifts || this.shifts;
        const shiftsToCommit = sourceShifts.filter(s => s.date >= startDate && s.date <= endDate);

        if (shiftsToCommit.length === 0) {
            console.log('[Sync] No shifts to save in this range.');
            return { error: null };
        }

        try {
            // 2. Perform Batch Upsert
            // Supabase upsert automatically handles "Insert if new, Update if exists" based on Primary Key (id)
            const { error: upsertError } = await supabase
                .from('shifts')
                .upsert(shiftsToCommit);

            if (upsertError) throw upsertError;

            console.log('[Sync] Commit successful (Safe Upsert).');
            return { error: null };

        } catch (error) {
            console.error('[Sync] Commit failed:', error);
            return { error };
        }
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
            const dateStr = toLocalISOString(d);
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
            const dateStr = toLocalISOString(d);
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

                // Strict: If user is on Leave (Manually or Auto), SKIP
                if (existingShift && existingShift.station === SYSTEM_OFF) return false;

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
                // const pool = [...allWorkingUsers].sort(() => Math.random() - 0.5); // already defined above if needed, but we use shuffledPool below
                const unfilledSlots: string[] = [];

                // Fisher-Yates Shuffle for true randomness
                const shuffledPool = this.shuffleArray([...allWorkingUsers]);

                for (const slot of slotsNeeded) {
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
            dateRange.push(toLocalISOString(d));
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

                    // Strict: If user is on Leave, SKIP immediately
                    if (shift && shift.station === SYSTEM_OFF) return false;

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
