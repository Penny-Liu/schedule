
import { User, Shift, LeaveRequest, SystemSettings, StationDefault, SYSTEM_OFF, RosterCycle, DateEventType, Holiday, LeaveStatus, LeaveType, StaffGroup, SPECIAL_ROLES, CycleAnchor, DailyManpowerStats, Doctor, DoctorShift } from '../types';
import { MOCK_USERS, MOCK_LEAVES, MOCK_DOCTORS } from './mockData';
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
        stationDisplayOrder: [],
        doctorStations: [
            { name: '影像', location: '北投' },
            { name: '遠', location: '北投' },
            { name: '支援', location: '大直' },
            { name: '眼科', location: '台中' },
            { name: '耳鼻喉科', location: '台中' },
            { name: '婦科', location: '台中' }
        ], // Default values
        doctorSpecialties: ['家醫科', '腸胃科', '放射科', '一般名醫', '其他'], // Default values
        defaultDoctorWorkTime: '08:30-17:30',
        doctorWorkTimeOptions: ['08:30-17:30', '08:00-12:00', '13:30-17:30']
    };
    doctors: Doctor[] = [];
    doctorShifts: DoctorShift[] = [];
    currentUser: User | null = null;
    isLoaded: boolean = false;
    connectionStatus: { type: 'Supabase' | 'Mock'; details?: string } = { type: 'Supabase' }; // Default assumption
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

            if (usersRes.error) {
                console.error('[Store] CRITICAL: Error fetching users:', usersRes.error);
            }

            if (usersRes.data && usersRes.data.length > 0) {
                console.log(`[Store] Successfully loaded ${usersRes.data.length} users from Supabase.`);
                this.users = usersRes.data;
                this.connectionStatus = { type: 'Supabase', details: 'Connected and loaded users' };
            } else {
                console.warn('[Store] Users table appears empty or fetch failed. Falling back to MOCK data.');
                const errorMsg = usersRes.error ? `Error: ${usersRes.error.message}` : 'Table empty';
                console.log('Database empty, seeding init data...');
                this.users = MOCK_USERS;
                this.connectionStatus = { type: 'Mock', details: `Fallback triggered. ${errorMsg}` };
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

            // Load Doctors and Doctor Shifts
            const { data: doctorsData } = await supabase.from('doctors').select('*');
            if (doctorsData && doctorsData.length > 0) {
                 const loadedDoctors = doctorsData.map((d: any) => ({
                    ...d,
                    capabilities: d.capabilities || [],
                    locations: d.locations || [],
                    excludedDays: d.excluded_days || [],
                    excludedAutoScheduleLocations: d.excluded_auto_schedule_locations || [],
                    isPartTime: d.is_part_time || false, // Map snake_case to camelCase
                    monthlyTargetShifts: d.monthly_target_shifts, // Map snake_case to camelCase
                    displayOrder: d.display_order // Map snake_case to camelCase
                }));
                this.doctors = loadedDoctors;
            } else {
                 // Auto-seed if empty
                 console.log('[Store] Doctors table empty, seeding mock data...');
                 await this.seedMockDoctors();
            }

            const { data: doctorShiftsData } = await supabase.from('doctor_shifts').select('*');
            if (doctorShiftsData) {
                this.doctorShifts = doctorShiftsData.map((s: any) => ({
                    ...s,
                    doctorId: s.doctor_id || s.doctorId, // Map snake_case to camelCase
                    explanationTaskType: s.explanation_task_type || s.explanationTaskType, // Map snake to camel
                    workTime: s.work_time || s.workTime,
                    note: s.note,
                    location: s.location,
                    task: s.task,
                    scheduled_station: s.scheduled_station // Explicit map
                }));
            }

            // Initialize default doctorStations if missing
            // Initialize default doctorStations if missing
            if (!this.settings.doctorStations) {
                this.settings.doctorStations = [
                    { name: '影像', location: '北投' },
                    { name: '遠', location: '北投' },
                    { name: '支援', location: '大直' },
                    { name: '眼科', location: '台中' },
                    { name: '耳鼻喉科', location: '台中' },
                    { name: '婦科', location: '台中' }
                ];
            }

            // Initialize default doctorSpecialties if missing
            if (!this.settings.doctorSpecialties) {
                this.settings.doctorSpecialties = ['家醫科', '腸胃科', '放射科', '一般名醫', '其他'];
            }

            // Initialize default lineCopyTemplate if missing
            if (!this.settings.lineCopyTemplate) {
                this.settings.lineCopyTemplate = `{{date}}
{{imaging_doctors}}

放射師人力
北投：{{beitou_count}} (客戶：{{beitou_clients}}  CTA  {{beitou_cta}})
BU領頭 場控：{{floor_control}}
MR : {{mr}}
US：{{us}}
CT: {{ct}}
BMD :{{bmd}}
{{support_section}}{{learning_section}}

遠群（{{remote_group_header}}）
{{remote_doctors_detail}}
遠：{{remote_radiographers}}

大直：{{dazhi_count}} （客戶 {{dazhi_clients}} ）
{{dazhi_radiographers}}

三線支援：{{third_line_support}}`;
            }

            this.isLoaded = true;
            console.log('Data initialized successfully');
        } catch (e: any) {
            console.error("Failed to fetch data from Supabase", e);
            this.connectionStatus = { type: 'Mock', details: `Critical Failure: ${e.message || JSON.stringify(e)}` };
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
    async saveSettings() {
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
    login(username: string): User | undefined {
        const user = this.users.find(u => u.username === username);
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

    getShift(userId: string, date: string): Shift | undefined {
        return this.shifts.find(s => s.userId === userId && s.date === date);
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
        if (!this.settings.stationRequirements) {
            this.settings.stationRequirements = {};
        }
        if (!this.settings.stationRequirements[name]) {
            this.settings.stationRequirements[name] = [0, 0, 0, 0, 0, 0, 0];
        }
        this.settings.stationRequirements[name][dayIndex] = count;
        await this.saveSettings();
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

    // Daily Stats
    getDailyStats(date: string) {
        return this.settings.dailyStats?.[date];
    }

    async updateDailyStats(date: string, stats: Partial<DailyManpowerStats>) {
        if (!this.settings.dailyStats) this.settings.dailyStats = {};

        const existing = this.settings.dailyStats[date] || {
            beitou_clients: 0,
            beitou_cta: 0,
            dazhi_clients: 0
        };

        this.settings.dailyStats[date] = { ...existing, ...stats };
        await this.saveSettings();
        this.notifyListeners();
    }

    // --- Doctor Management ---

    getDoctors() {
        // Sort by displayOrder (ascending), with undefined values at the end
        return [...this.doctors].sort((a, b) => {
            const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
            const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
            return orderA - orderB;
        });
    }

    async addDoctor(name: string, alias?: string, capabilities: string[] = [], locations: string[] = [], excludedDays: number[] = [], excludedAutoScheduleLocations: string[] = [], isPartTime: boolean = false, specialty?: string, monthlyTargetShifts?: number): Promise<{ success: boolean; error?: string; id?: string }> {
        const newDoctor: Doctor = { id: crypto.randomUUID(), name, alias: alias || name[0], capabilities, locations, excludedDays, excludedAutoScheduleLocations, specialty, isPartTime, monthlyTargetShifts }; // Default alias to first char if not provided
        this.doctors.push(newDoctor); // Optimistic update
        this.notifyListeners();
        
        try {
             // Map camelCase to snake_case for DB if needed
            const { error } = await supabase.from('doctors').insert({
                id: newDoctor.id,
                name,
                alias: newDoctor.alias,
                capabilities,
                locations,
                excluded_days: excludedDays,
                excluded_auto_schedule_locations: excludedAutoScheduleLocations,
                specialty: specialty,
                is_part_time: isPartTime,
                monthly_target_shifts: monthlyTargetShifts
            });
            if (error) throw error;
            return { success: true, id: newDoctor.id };
        } catch (error: any) {
            console.error('Failed to add doctor:', error);
            
            // Critical: Allow offline/mock testing if connection fails
            if (error.messsage?.includes('Failed to fetch') || error.message?.includes('fetch') || this.connectionStatus.type === 'Mock') {
                console.warn('[Mock] Supabase failed, keeping local change for addDoctor');
                return { success: true, id: newDoctor.id };
            }

            // Revert optimistic update
            this.doctors = this.doctors.filter(d => d.id !== newDoctor.id);
            this.notifyListeners();
            return { success: false, error: error.message || JSON.stringify(error) };
        }
    }

    async updateDoctor(doctor: Doctor) {
         this.doctors = this.doctors.map(d => d.id === doctor.id ? doctor : d);
         this.notifyListeners(); // Notify immediately

         try {
            const { error } = await supabase.from('doctors').update({
                name: doctor.name,
                alias: doctor.alias,
                capabilities: doctor.capabilities,
                locations: doctor.locations,
                excluded_days: doctor.excludedDays,
                excluded_auto_schedule_locations: doctor.excludedAutoScheduleLocations,
                specialty: doctor.specialty,
                is_part_time: doctor.isPartTime,
                monthly_target_shifts: doctor.monthlyTargetShifts,
                display_order: doctor.displayOrder
            }).eq('id', doctor.id);
            if(error) throw error;
         } catch(error: any) {
             console.error('Failed to update doctor:', error);
             if (error.messsage?.includes('Failed to fetch') || error.message?.includes('fetch') || this.connectionStatus.type === 'Mock') {
                 console.warn('[Mock] Supabase failed, saving local change for updateDoctor');
             }
         }
    }

    async reorderDoctor(doctorId: string, direction: 'up' | 'down') {
        const sortedDoctors = this.getDoctors();
        const currentIndex = sortedDoctors.findIndex(d => d.id === doctorId);
        
        if (currentIndex === -1) return;
        
        // Check boundaries
        if (direction === 'up' && currentIndex === 0) return; // Already at top
        if (direction === 'down' && currentIndex === sortedDoctors.length - 1) return; // Already at bottom
        
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        const currentDoctor = sortedDoctors[currentIndex];
        const targetDoctor = sortedDoctors[targetIndex];
        
        // Swap displayOrder values
        const tempOrder = currentDoctor.displayOrder ?? currentIndex;
        const newTargetOrder = targetDoctor.displayOrder ?? targetIndex;
        
        currentDoctor.displayOrder = newTargetOrder;
        targetDoctor.displayOrder = tempOrder;
        
        // Update both doctors in memory
        this.doctors = this.doctors.map(d => {
            if (d.id === currentDoctor.id) return currentDoctor;
            if (d.id === targetDoctor.id) return targetDoctor;
            return d;
        });
        
        this.notifyListeners(); // Optimistic Update

        // Persist to database
        try {
            await Promise.all([
                supabase.from('doctors').update({ display_order: currentDoctor.displayOrder }).eq('id', currentDoctor.id),
                supabase.from('doctors').update({ display_order: targetDoctor.displayOrder }).eq('id', targetDoctor.id)
            ]);
        } catch (error) {
            console.error('Failed to persist doctor order:', error);
            // Revert? Complex. For now just warn.
        }
    }

    async deleteDoctor(id: string) {
        // Optimistic update
        const originalDoctors = [...this.doctors];
        this.doctors = this.doctors.filter(d => d.id !== id);
        this.doctorShifts = this.doctorShifts.filter(s => s.doctorId !== id); 
        this.notifyListeners(); // Notify immediately for responsiveness

        // Remote update
        try {
            // Delete shifts first to avoid FK constraint violations
            const { error: shiftsError } = await supabase.from('doctor_shifts').delete().eq('doctorId', id);
            if (shiftsError) { console.error('Error deleting doctor shifts:', shiftsError); throw shiftsError; }
            
            const { error } = await supabase.from('doctors').delete().eq('id', id);
            if(error) throw error;
        } catch(e: any) {
             console.error('Failed to delete doctor:', e);
             if (e.messsage?.includes('Failed to fetch') || e.message?.includes('fetch') || this.connectionStatus.type === 'Mock') {
                 console.warn('[Mock] Deleting doctor locally only');
                 return;
             }
             // Revert if critical failure and not mock
             this.doctors = originalDoctors;
             this.notifyListeners();
        }
    }

    async seedMockDoctors() {
        // Check if we already have these specific mock doctors to avoid duplicates if partial load
        if (this.doctors.length > 0) return;

        console.log('[Store] Seeding mock doctors from mockData...');
        
        for (const doc of MOCK_DOCTORS) {
            // We use the ID from mock data to ensure consistency across reloads if using local mock mode
            // But addDoctor generates a new UUID normally. 
            // For seeding consistency, we'll manually push or ensure Supabase insert uses these IDs if possible, 
            // but addDoctor currently generates randomUUID. 
            // Let's just pass the data to addDoctor for now, realizing IDs might change on fresh DB.
            // Actually, to respect the user's wish for "static" mock data, let's try to preserve these IDs if possible
            // OR just let addDoctor handle it. For simplicity, we use addDoctor.
            await this.addDoctor(doc.name, doc.alias, doc.capabilities, doc.locations);
        }
    }



    // --- Doctor Schedule ---

    getDoctorShifts() {
        return this.doctorShifts;
    }
    
    getDoctorShift(doctorId: string, date: string) {
        return this.doctorShifts.find(s => s.doctorId === doctorId && s.date === date);
    }

    async assignDoctor(doctorId: string, date: string, station: string, workTime?: string, note?: string, location?: string, task?: string) {
        // Remove existing shift for this doctor on this date if any
        let shift = this.doctorShifts.find(s => s.doctorId === doctorId && s.date === date);
        
        if (shift) {
            shift.station = station;
            shift.workTime = workTime;
            shift.note = note;
            shift.location = location;
            shift.task = task;
            try {
                // Keep scheduled_station as is
                await supabase.from('doctor_shifts')
                    .update({ station, work_time: workTime, note, location, task })
                    .eq('id', shift.id);
            } catch(e) { console.warn('Supabase update failed, using local'); }
        } else {
            shift = { id: crypto.randomUUID(), doctorId, date, station, workTime, note, location, task };
            this.doctorShifts.push(shift);
            try {
                await supabase.from('doctor_shifts').insert({ ...shift, work_time: shift.workTime }); // Map camelCase to snake_case for DB
            } catch(e) { console.warn('Supabase insert failed, using local'); }
        }
        
        // Auto-pair Gynecology + Explanation
        await this.autoPairGynecologyWithExplanation(doctorId, date, station);
        
        this.notifyListeners();
    }

    // New: Specific method for updating Physicians Schedule (CT, MR, US)
    // This updates 'scheduled_station' column, leaving 'station' (Manpower Allocation) untouched if possible
    async assignDoctorSchedule(doctorId: string, date: string, scheduledStation: string, workTime?: string, note?: string, location?: string, task?: string) {
        let shift = this.doctorShifts.find(s => s.doctorId === doctorId && s.date === date);
        
        if (shift) {
            shift.scheduled_station = scheduledStation;
            // Also update other metadata if provided
            if (workTime !== undefined) shift.workTime = workTime;
            if (note !== undefined) shift.note = note;
            if (location !== undefined) shift.location = location;
            if (task !== undefined) shift.task = task;

            try {
                const { error } = await supabase.from('doctor_shifts')
                    .update({ 
                        scheduled_station: scheduledStation, 
                        work_time: workTime, 
                        note, 
                        location, 
                        task 
                    })
                    .eq('id', shift.id);
                
                if (error) {
                    console.error('[Store] Update Error:', error);
                    alert(`儲存失敗: ${error.message}\n請確認已執行 SQL 腳本 (add_scheduled_station_column.sql)`);
                }
            } catch(e) { console.warn('Supabase update failed, using local', e); }
        } else {
            // New shift from Schedule View
            // Default 'station' (Allocation) to something? Or leave empty?
            // If empty, it won't show in Dashboard (which is Good/Expected until assigned)
            // Or default to 'Unassigned'? 
            // Let's set station to 'Unassigned' or similar if not provided, to avoid DB constraint if any
            // Assuming 'station' is NOT NULL in DB? Schema check? Usually users make it text.
            // Let's assume we can set it to a placeholder if new.
            
            shift = { 
                id: crypto.randomUUID(), 
                doctorId, 
                date, 
                station: '未分配', // Default allocation
                scheduled_station: scheduledStation,
                workTime, 
                note, 
                location, 
                task 
            };
            this.doctorShifts.push(shift);
            try {
                const { error } = await supabase.from('doctor_shifts').insert({ 
                    id: shift.id,
                    doctor_id: shift.doctorId, 
                    date: shift.date,
                    station: shift.station,
                    scheduled_station: shift.scheduled_station,
                    work_time: shift.workTime,
                    note: shift.note,
                    location: shift.location,
                    task: shift.task,
                    is_auto_generated: false
                }); 
                
                if (error) {
                    console.error('[Store] Insert Error:', error);
                    alert(`新增失敗: ${error.message}\n請確認已執行 SQL 腳本 (add_scheduled_station_column.sql)`);
                }
            } catch(e) { console.warn('Supabase insert failed, using local', e); }
        }
        this.notifyListeners();
    }
    
    async removeDoctorFromStation(doctorId: string, date: string) {
        const shift = this.doctorShifts.find(s => s.doctorId === doctorId && s.date === date);
        if (shift) {
            this.doctorShifts = this.doctorShifts.filter(s => s.id !== shift.id);
            await supabase.from('doctor_shifts').delete().eq('id', shift.id);
            this.notifyListeners();
        }
    }

    async cycleExplanationTaskType(shiftId: string) {
        const shift = this.doctorShifts.find(s => s.id === shiftId);
        if (shift) {
            // Cycle through: null -> 'with_task' -> 'standalone' -> null
            if (!shift.explanationTaskType) {
                shift.explanationTaskType = 'with_task';
            } else if (shift.explanationTaskType === 'with_task') {
                shift.explanationTaskType = 'standalone';
            } else {
                shift.explanationTaskType = undefined;
            }
            
            const { data, error } = await supabase.from('doctor_shifts').update({ 
                explanation_task_type: shift.explanationTaskType || null
            }).eq('id', shift.id).select();

            if (error) {
                console.error("Error updating explanation_task_type:", error);
                alert("儲存失敗，請檢查網路或是權限：" + error.message);
                // Revert local change if needed, but for now just alerting is enough
            } else {
                console.log("Success updating explanation_task_type:", data);
                if (data.length === 0) {
                     console.warn("Update successful but NO ROWS modified. ID mismatch?", shift.id);
                }
            }
            this.notifyListeners();
        }
    }

    // Check if a specific month is locked (YYYY-MM)
    isMonthLocked(yearMonth: string): boolean {
        return this.settings.lockedMonths?.includes(yearMonth) ?? false;
    }

    // Toggle lock status for a month
    async toggleMonthLock(yearMonth: string) {
        let current = this.settings.lockedMonths || [];
        if (current.includes(yearMonth)) {
            current = current.filter(m => m !== yearMonth);
        } else {
            current = [...current, yearMonth];
        }
        this.settings.lockedMonths = current;
        await this.saveSettings();
        this.notifyListeners();
        return this.isMonthLocked(yearMonth);
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

    /**
     * Auto-pair Gynecology + Explanation shifts
     * When a non-part-time doctor is assigned to "婦科", automatically add "解說" shift
     */
    private async autoPairGynecologyWithExplanation(doctorId: string, date: string, station: string) {
        // Only pair if station is "婦科"
        if (station !== '婦科') return;
        
        // Check if doctor is part-time
        const doctor = this.doctors.find(d => d.id === doctorId);
        if (!doctor || doctor.isPartTime) return;
        
        // Check if explanation shift already exists for this doctor on this date
        const existingExplanationShift = this.doctorShifts.find(
            s => s.doctorId === doctorId && s.date === date && s.station === '解說'
        );
        
        if (existingExplanationShift) {
            // Already has explanation shift, no need to add
            return;
        }
        
        // Add explanation shift
        const explanationShift: DoctorShift = {
            id: crypto.randomUUID(),
            doctorId,
            date,
            station: '解說',
            location: '', // Use same location as gynecology shift if needed
            isAutoGenerated: true
        };
        
        this.doctorShifts.push(explanationShift);
        
        // Persist to database
        try {
            await supabase.from('doctor_shifts').insert({
                id: explanationShift.id,
                doctorId: explanationShift.doctorId,
                date: explanationShift.date,
                station: explanationShift.station,
                location: explanationShift.location,
                is_auto_generated: true
            });
        } catch (e) {
            console.warn('Failed to persist auto-paired explanation shift', e);
        }
    }

    async resortDoctorsBySpecialty() {
        // Priority: 放射線科 > 家醫科 > 腸胃科 > Others
        const getRank = (doc: Doctor) => {
            // Hotfix: Force specific doctors to Radiology if data is missing
            // Use includes to handle potential whitespace (e.g. "謝 弼丞" or "謝弼丞 ")
            if (doc.name && doc.name.replace(/\s/g, '').includes('謝弼丞')) return 1;

            const specialty = doc.specialty;
            if (!specialty) return 4;
            
            // Chinese & English support
            const s = specialty.toLowerCase();
            if (s.includes('放射') || s.includes('radio') || s.includes('img')) return 1;
            if (s.includes('家醫') || s.includes('家庭') || s.includes('family') || s.includes('fm')) return 2;
            if (s.includes('腸胃') || s.includes('胃腸') || s.includes('消化') || s.includes('gastro') || s.includes('gi')) return 3;
            
            return 4;
        };

        const sorted = [...this.doctors].sort((a, b) => {
            const rankA = getRank(a);
            const rankB = getRank(b);
            
            // Debug Log for specific doctors
            if (a.name.includes('蘇芳儀') || a.name.includes('謝弼丞') || a.name.includes('鄭敏')) {
                 console.log(`Sorting Debug: ${a.name} (${a.specialty}) Rank=${rankA}`);
            }
            if (b.name.includes('蘇芳儀') || b.name.includes('謝弼丞') || b.name.includes('鄭敏')) {
                 console.log(`Sorting Debug: ${b.name} (${b.specialty}) Rank=${rankB}`);
            }

            if (rankA !== rankB) return rankA - rankB;
            // Maintain relative current order
            return (a.displayOrder || 0) - (b.displayOrder || 0);
        });
        
        console.log('--- Sorted Doctors Sample ---');
        sorted.slice(0, 10).forEach(d => console.log(`${d.name}: Rank=${getRank(d)} Order=${d.displayOrder}`));

        // Re-assign display orders
        for (let i = 0; i < sorted.length; i++) {
            const doc = sorted[i];
            if (doc.displayOrder !== i) {
                doc.displayOrder = i;
                // Update in DB (fire and forget / parallel)
                await this.updateDoctor(doc);
            }
        }
        
        this.doctors = sorted;
        this.notifyListeners();
        return true;
    }

    async autoScheduleDoctors(startDate: string, endDate: string, targetDaysPerDoctor?: Record<string, number>) {
        console.log(`[Auto] Scheduling Doctors from ${startDate} to ${endDate}...`);
        
        // 1. Prepare
        const assignments: DoctorShift[] = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        const dayMs = 24 * 60 * 60 * 1000;
        
        // Load existing shifts to prevent double booking or respect manual
        // Strategy: Overwrite only generated? Or overwrite all? 
        // For "One Click", we usually want to fill gaps or Full Re-schedule. 
        // Let's assume Full Re-schedule for the empty slots, but if we want to overwrite, we should clear first.
        // For now, let's just FILL EMPTY slots for specific stations.
        
        // Actually, user probably wants a fresh schedule.
        // Let's clear existing auto-generated ones? Or all?
        // Safe bet: Clear all doctor shifts in range? Or maybe just overlapping ones?
        // Let's try to be smart: Fill gaps.
        
        const stationsToSchedule = this.settings.doctorStations || [];
        
        // Count existing shifts for this month to respect targets
        const doctorShiftCounts = new Map<string, number>();
        this.doctorShifts.forEach(s => {
             if (s.date >= startDate && s.date <= endDate) {
                 const current = doctorShiftCounts.get(s.doctorId) || 0;
                 doctorShiftCounts.set(s.doctorId, current + 1);
             }
        });
        
        for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
            const currentD = new Date(t);
            const dateStr = toLocalISOString(currentD);
            const dayOfWeek = currentD.getDay(); // 0-6
            
            // Get already assigned doctors for this day
            const existingShifts = this.doctorShifts.filter(s => s.date === dateStr);
            const assignedDoctorIds = new Set(existingShifts.map(s => s.doctorId));
            
            // Needed Stations (e.g., 2 x Imaging, 1 x Remote, etc. - currently simplistic 1 per station name)
            // Real world needs "Quotas". For now, assume 1 person per station in the list.
            
            // Randomize stations to avoid priority bias
            const loopStations = this.shuffleArray([...stationsToSchedule]);
            
            for (const stationConfig of loopStations) {
                // Use Explicit Configured Location
                const stationName = stationConfig.name;
                const stationLocation = stationConfig.location;

                // NEW: Check station requirement quota (how many people needed for this station on this day)
                const stationKey = `${stationName}_${stationLocation}`; // Composite key for unique station+location
                const dayOfWeekIndex = dayOfWeek; // 0=Sun, 1=Mon, ..., 6=Sat
                const requirements = this.settings.stationRequirements || {};
                
                // Try composite key first, fallback to station name only
                let requiredCount = requirements[stationKey]?.[dayOfWeekIndex];
                if (requiredCount === undefined) {
                    requiredCount = requirements[stationName]?.[dayOfWeekIndex];
                }
                if (requiredCount === undefined || requiredCount === 0) {
                    // If no requirement set or set to 0, skip this station (don't auto-schedule)
                    console.log(`[Auto] Skipping ${stationKey} on day ${dayOfWeekIndex}: No requirement set (required: ${requiredCount})`);
                    continue;
                }
                
                // Count how many doctors are already assigned to this station+location on this day
                let currentAssignedCount = existingShifts.filter(s => 
                    s.station === stationName && s.location === stationLocation
                ).length;
                
                console.log(`[Auto] ${stationKey} on ${dateStr}: Required=${requiredCount}, Current=${currentAssignedCount}`);
                
                // FIXED: Loop to fill all required slots, not just one
                while (currentAssignedCount < requiredCount) {
                    // Find candidates
                    const potentialCandidates = this.doctors.filter(doc => {
                        // Exclude Part-Time from Auto-Schedule (User Request)
                        if (doc.isPartTime) return false;
                        
                        // NEW: Exclude doctors with 0 target days (user doesn't want them scheduled)
                        if (targetDaysPerDoctor && targetDaysPerDoctor[doc.id] === 0) return false;

                        // Capability Check
                        if (!doc.capabilities?.includes(stationName)) return false;

                        // Excluded Days
                        if (doc.excludedDays?.includes(dayOfWeek)) return false;

                        // Location Check
                        if (doc.locations && doc.locations.length > 0 && !doc.locations.includes(stationLocation)) return false;

                        // Excluded Auto-Schedule Location
                        if (doc.excludedAutoScheduleLocations?.includes(stationLocation)) return false;

                        // Exclude if already assigned today
                        if (assignedDoctorIds.has(doc.id)) return false;

                        return true;
                    });

                    // FIXED: Strict target enforcement - no overtime
                    let finalCandidates = potentialCandidates;
                    
                    if (targetDaysPerDoctor) {
                        // Only include doctors who haven't reached their target
                        const candidatesBelowTarget = potentialCandidates.filter(doc => {
                            const currentCount = doctorShiftCounts.get(doc.id) || 0;
                            const target = targetDaysPerDoctor[doc.id] || 0;
                            return currentCount < target;
                        });

                        finalCandidates = candidatesBelowTarget;
                    }

                    if (finalCandidates.length === 0) {
                        // No available doctors - stop trying to fill this station
                        console.log(`[Auto] No available doctors for ${stationKey}, stopping at ${currentAssignedCount}/${requiredCount}`);
                        break;
                    }

                    // FIXED: Sort by current shift count (ascending) to prioritize doctors with fewer shifts
                    finalCandidates.sort((a, b) => {
                        const countA = doctorShiftCounts.get(a.id) || 0;
                        const countB = doctorShiftCounts.get(b.id) || 0;
                        return countA - countB;
                    });

                    // Pick the doctor with the fewest shifts (first in sorted array)
                    const winner = finalCandidates[0];

                    // Assign
                    const newShift: DoctorShift = {
                        id: crypto.randomUUID(),
                        doctorId: winner.id,
                        date: dateStr,
                        station: stationName,
                        location: stationLocation,
                        isAutoGenerated: true
                    };

                    assignments.push(newShift);
                    
                    // Update Local State for next iteration
                    assignedDoctorIds.add(winner.id);
                    existingShifts.push(newShift); // To prevent double booking same station in same loop
                    const currentCount = doctorShiftCounts.get(winner.id) || 0;
                    doctorShiftCounts.set(winner.id, currentCount + 1);
                    
                    // Increment the assigned count for this station
                    currentAssignedCount++;
                }

            }
        }
        
        // Commit
        if (assignments.length > 0) {
            this.doctorShifts.push(...assignments);
            try {
                // Batch insert - only include fields that exist in DB
                const { error } = await supabase.from('doctor_shifts').insert(assignments.map(a => {
                    const record: any = {
                        id: a.id,
                        doctorId: a.doctorId,
                        date: a.date,
                        station: a.station,
                        is_auto_generated: a.isAutoGenerated || false
                    };
                    // Add optional fields if they exist
                    if (a.location) {
                        record.location = a.location;
                    }
                    if (a.explanationTaskType) {
                        record.explanation_task_type = a.explanationTaskType;
                    }
                    return record;
                }));
                if(error) {
                    console.error('Auto save failed', error);
                    // Continue with local-only mode if save fails
                }
            } catch(e) { console.warn('Local save only', e); }
            
            this.notifyListeners();
        }
        
        // Auto-pair Gynecology + Explanation shifts
        console.log('[Auto] Checking for gynecology-explanation pairing...');
        for (const assignment of assignments) {
            await this.autoPairGynecologyWithExplanation(assignment.doctorId, assignment.date, assignment.station);
        }
        
        return assignments.length;

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
