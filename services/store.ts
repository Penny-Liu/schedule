
import { User, Shift, HealthMgmtShift, LeaveRequest, SystemSettings, StationDefault, SYSTEM_OFF, RosterCycle, DateEventType, Holiday, LeaveStatus, LeaveType, StaffGroup, SPECIAL_ROLES, CycleAnchor, DailyManpowerStats, Doctor, WeekdaySetting, DoctorShift, ReportAssistant, CloudScheduleEntry, UserRole, PERMISSIONS, HealthMgmtStaff, AnesthesiaStaff, AnesthesiaShift } from '../types';
import { MOCK_USERS, MOCK_LEAVES, MOCK_DOCTORS } from './mockData';
import { supabase } from './supabaseClient';
import { generateUUID } from './utils';

const SCHEDULE_STORAGE_KEY = 'radiology_schedule_data';

// Helper: Get permissions by role for backward compatibility
export const getPermissionsByRole = (role: UserRole): string[] => {
    switch (role) {
        case UserRole.SYSTEM_ADMIN:
            return Object.values(PERMISSIONS);
        case UserRole.SUPERVISOR:
            return [
                PERMISSIONS.VIEW_CLOUD_SCHEDULE,
                PERMISSIONS.EDIT_CLOUD_SCHEDULE,
                PERMISSIONS.VIEW_STAFF,
                PERMISSIONS.EDIT_STAFF,
                PERMISSIONS.VIEW_PHYSICIAN,
                PERMISSIONS.VIEW_STATS,
                PERMISSIONS.EDIT_SETTINGS,
                PERMISSIONS.VIEW_HEALTH_MGMT,
                PERMISSIONS.VIEW_ANESTHESIA
            ];
        case UserRole.PHYSICIAN_ADMIN:
        case UserRole.SCHEDULER:
            return [
                PERMISSIONS.VIEW_CLOUD_SCHEDULE,
                PERMISSIONS.VIEW_PHYSICIAN,
                PERMISSIONS.EDIT_PHYSICIAN,
                PERMISSIONS.MANAGE_DOCTORS,
                PERMISSIONS.VIEW_DOCTOR_STATS,
                PERMISSIONS.EDIT_DOCTOR_STATS
            ];
        case UserRole.HM_SUPERVISOR:
            return [
                PERMISSIONS.VIEW_CLOUD_SCHEDULE,
                PERMISSIONS.VIEW_HEALTH_MGMT,
                PERMISSIONS.EDIT_HEALTH_MGMT,
                PERMISSIONS.VIEW_ANESTHESIA,
                PERMISSIONS.EDIT_ANESTHESIA,
                PERMISSIONS.VIEW_STAFF, // Allow HM Supervisor to view staff list
                PERMISSIONS.EDIT_SETTINGS
            ];
        case UserRole.HM_STAFF:
            return [
                PERMISSIONS.VIEW_CLOUD_SCHEDULE,
                PERMISSIONS.VIEW_HEALTH_MGMT
            ];
        case UserRole.FINANCE:
            return [
                PERMISSIONS.VIEW_PHYSICIAN,
                PERMISSIONS.VIEW_DOCTOR_STATS
            ];
        case UserRole.VIEWER:
            return [
                PERMISSIONS.VIEW_CLOUD_SCHEDULE,
                PERMISSIONS.VIEW_PHYSICIAN
            ];
        default: // RADIOGRAPHER_STAFF
            return [
                PERMISSIONS.VIEW_CLOUD_SCHEDULE,
                PERMISSIONS.VIEW_PHYSICIAN
            ];
    }
};

import { toLocalISOString, countNonSundayDays } from './utils';

class Store {
    users: User[] = [];
    healthMgmtStaff: HealthMgmtStaff[] = [];
    anesthesiaStaff: AnesthesiaStaff[] = [];
    shifts: Shift[] = [];
    healthMgmtShifts: HealthMgmtShift[] = [];
    anesthesiaShifts: AnesthesiaShift[] = [];
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
        doctorSpecialties: ['家醫科', '腸胃科', '影像醫學部', '一般名醫', '其他'], // Default values
        defaultDoctorWorkTime: '08:30-17:30',
        doctorWorkTimeOptions: ['08:30-17:30', '08:00-12:00', '13:30-17:30']
    };
    doctors: Doctor[] = [];
    doctorShifts: DoctorShift[] = [];
    reportAssistants: ReportAssistant[] = [];
    cloudScheduleEntries: CloudScheduleEntry[] = [];
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

    private async fetchPaginated(tableName: string, queryModifier?: (query: any) => any) {
        let allData: any[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        let lastError = null;

        while (hasMore) {
            let query = supabase
                .from(tableName)
                .select('*')
                .range(page * pageSize, (page + 1) * pageSize - 1);
            
            if (queryModifier) {
                query = queryModifier(query);
            }

            const { data, error } = await query;

            if (error) {
                console.error(`Error fetching ${tableName} page ${page}:`, error);
                lastError = error;
                hasMore = false;
            } else if (data) {
                allData = [...allData, ...data];
                if (data.length < pageSize) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                hasMore = false;
            }
        }

        console.log(`[Pagination] Total ${tableName} fetched: ${allData.length}`);
        return { data: allData, error: lastError };
    }

    // Helper: Fetch all shifts with pagination to bypass 1000-row limit
    private async fetchAllShifts() {
        return this.fetchPaginated('shifts');
    }

    private async fetchAllHealthMgmtShifts() {
        return this.fetchPaginated('health_mgmt_shifts');
    }

    private async fetchAllDoctorShifts() {
        return this.fetchPaginated('doctor_shifts');
    }


    // New method to fetch all data from Supabase
    async initializeData(force: boolean = false) {
        if (this.isLoaded && !force) return;

        // Setup Realtime Subscription
        this.setupRealtimeSubscription();

        try {
            console.log('Fetching data from Supabase...');

            // Load Cloud Schedule Data early
            console.log('[Store] Loading data from Supabase...');
            const [usersRes, shiftsRes, leavesRes, settingsRes, doctorsRes, dShiftsRes, hmStaffRes, hmShiftsRes, anesthesiaStaffRes, anesthesiaShiftsRes] = await Promise.all([
                this.fetchPaginated('users'),
                this.fetchAllShifts(),
                this.fetchPaginated('leaves'),
                supabase.from('settings').select('*'), // Settings is usually 1 row
                this.fetchPaginated('doctors'),
                this.fetchAllDoctorShifts(),
                this.fetchPaginated('health_mgmt_staff'),
                this.fetchAllHealthMgmtShifts(),
                this.fetchPaginated('anesthesia_staff'),
                this.fetchPaginated('anesthesia_shifts')
            ]);
            console.log('[Store] Data loaded. Errors:', {
                users: usersRes.error,
                shifts: shiftsRes.error,
                leaves: leavesRes.error,
                settings: settingsRes.error,
                doctors: doctorsRes.error,
                doctorShifts: dShiftsRes.error,
                hmStaff: hmStaffRes.error,
                hmShifts: hmShiftsRes.error
            });

            if (usersRes.data && usersRes.data.length > 0) {
                console.log(`[Store] Successfully loaded ${usersRes.data.length} users from Supabase.`);
                this.users = usersRes.data.map((u: any) => {
                    const mappedUser = { ...u };
                    this.mapFromDbFields(mappedUser);
                    
                    const permissions = (mappedUser.permissions !== null && mappedUser.permissions !== undefined) 
                        ? mappedUser.permissions 
                        : getPermissionsByRole(mappedUser.role);
                    
                    // Debug: Log permissions for critical roles
                    if (mappedUser.role === UserRole.SCHEDULER || mappedUser.role === UserRole.SYSTEM_ADMIN) {
                        console.log(`[Store] User ${mappedUser.name} (${mappedUser.role}) permissions:`, permissions);
                    }

                    return {
                        ...mappedUser,
                        permissions
                    };
                });
                this.connectionStatus = { type: 'Supabase', details: `Loaded ${this.users.length} users` };
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
                    const mappedShift = { ...s };
                    this.mapFromDbFields(mappedShift);
                    
                    const key = `${mappedShift.userId}-${mappedShift.date}`;
                    const existing = uniqueShiftsMap.get(key);

                    if (!existing) {
                        uniqueShiftsMap.set(key, mappedShift);
                    } else {
                        // ... existing logic ...
                        const isExistingIdBad = existing.id.includes(' ');
                        const isNewIdBad = mappedShift.id.includes(' ');
                        if (isExistingIdBad && !isNewIdBad) {
                            uniqueShiftsMap.set(key, mappedShift);
                            return;
                        }
                        if (existing.station === 'Unassigned' || existing.station === '未分配' || !existing.station) {
                            if (mappedShift.station && mappedShift.station !== 'Unassigned' && mappedShift.station !== '未分配') {
                                uniqueShiftsMap.set(key, mappedShift);
                            }
                        }
                    }
                });
                this.shifts = Array.from(uniqueShiftsMap.values());
            }
            if (hmShiftsRes.data) {
                this.healthMgmtShifts = hmShiftsRes.data.map((s: any) => {
                    const mapped = { ...s };
                    this.mapFromDbFields(mapped);
                    // Unpack location from task if present
                    let task = mapped.task || '';
                    let location = undefined;
                    if (task.includes('@@')) {
                        const parts = task.split('@@');
                        task = parts[0];
                        location = parts[1];
                    }
                    if (task === '') task = undefined;
                    mapped.task = task;
                    mapped.location = location;
                    return mapped;
                });
            }
            if (leavesRes.data && leavesRes.data.length > 0) {
                this.leaves = leavesRes.data.map(l => {
                    const mapped = { ...l };
                    this.mapFromDbFields(mapped);
                    return mapped;
                });
            } else {
                console.log('Database empty (leaves), seeding init data...');
                this.leaves = MOCK_LEAVES;
                // Auto-seed Leaves
                const { error } = await supabase.from('leaves').insert(MOCK_LEAVES);
                if (error) console.error('Failed to seed leaves:', error);
            }

            // Enhanced Settings Fetch: Try ID=1 first, then fallback to ANY row
            let finalSettingsData = null;

            if (settingsRes.data && settingsRes.data.length > 0) {
                finalSettingsData = settingsRes.data[0].data;
                this.settingsRowId = settingsRes.data[0].id; // Capture ID
            } else if (settingsRes.error && settingsRes.error.code === 'PGRST116') {
                // ID=1 not found. Try fetching ANY settings row (fallback)
                const fallbackRes = await supabase.from('settings').select('id, data').limit(1).single();
                if (fallbackRes.data && fallbackRes.data.data) {
                    console.log('[DEBUG] Found settings with non-standard ID. Using it.');
                    finalSettingsData = fallbackRes.data.data;
                    this.settingsRowId = fallbackRes.data.id; // Capture ID
                }
            } else if (settingsRes.data && settingsRes.data.length > 0) { // Handle case where select('*') returns an array
                finalSettingsData = settingsRes.data[0].data;
                this.settingsRowId = settingsRes.data[0].id;
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
            if (doctorsRes.data && doctorsRes.data.length > 0) {
                 const loadedDoctors = doctorsRes.data.map((d: any) => ({
                    ...d,
                    capabilities: d.capabilities || [],
                    locations: d.locations || [],
                    excludedDays: d.excluded_days || [],
                    excludedAutoScheduleLocations: d.excluded_auto_schedule_locations || [],
                    isPartTime: d.is_part_time || false, // Map snake_case to camelCase
                    monthlyTargetShifts: d.monthly_target_shifts, // Map snake_case to camelCase
                    displayOrder: d.display_order, // Map snake_case to camelCase
                    fixedShifts: d.fixed_shifts || [], // Map snake_case to camelCase
                    personalCycles: d.personal_cycles,
                    isActive: d.is_active !== false, // Default to true if missing
                    weekdaySettings: (d.weekday_settings || []).map((s: any) => ({
                        dayOfWeek: s.dayOfWeek,
                        workTime: s.workTime,
                        task: s.task || s.memo // Migrate old memo to task on read
                    }))
                }));
                console.log('[Store] Doctors loaded with settings:', loadedDoctors.map((d: any) => ({ name: d.name, weekdaySettings: d.weekdaySettings })));
                this.doctors = loadedDoctors;
            }

            if (dShiftsRes.data) {
                this.doctorShifts = dShiftsRes.data.map((s: any) => ({
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

            if (hmStaffRes.data) {
                this.healthMgmtStaff = hmStaffRes.data.map((hm: any) => ({
                    id: hm.id,
                    name: hm.name,
                    alias: hm.alias,
                    isActive: hm.is_active,
                    role: hm.role || 'VIEWER',
                    location: hm.location
                }));
            }

            if (anesthesiaStaffRes.data) {
                this.anesthesiaStaff = anesthesiaStaffRes.data.map((as: any) => ({
                    id: as.id,
                    name: as.name,
                    alias: as.alias,
                    isActive: as.is_active,
                    locations: as.locations || [],
                    role: as.role || 'VIEWER'
                }));
            }

            if (anesthesiaShiftsRes.data) {
                this.anesthesiaShifts = anesthesiaShiftsRes.data.map((s: any) => ({
                    ...s,
                    userId: s.user_id,
                    workTime: s.work_time,
                    scheduled_station: s.scheduled_station
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

            // Ensure '晚班' exists for Beitou/Dazhi (User Request) and is at the top
            const requiredLateStations = [
                { name: '晚班', location: '大直' }, // Order: Dazhi Late
                { name: '晚班', location: '北投' }  // Order: Beitou Late (First, if array unshifted reversed? No, unshift puts at index 0. So last unshifted is top.)
                // Actually, let's just use array logic.
            ];
            
            // We want '晚班' to be the first station in each location group.
            // Since we render by Location -> Filter Stations, the order within doctorStations matters.
            requiredLateStations.forEach(req => {
                if (!this.settings.doctorStations.some(s => s.name === req.name && s.location === req.location)) {
                     this.settings.doctorStations.unshift(req);
                }
            });

            // Initialize default doctorSpecialties if missing
            if (!this.settings.doctorSpecialties) {
                this.settings.doctorSpecialties = ['家醫科', '腸胃科', '影像醫學部', '一般名醫', '其他'];
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

            // Load cloud schedule data (影像雲班表)
            await this.loadCloudScheduleData();

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

            allShifts.forEach((s: any) => {
                const key = `${s.date}_${s.user_id}_${s.station}`;
                if (uniqueMap.has(key)) {
                    idsToDelete.push(s.id);
                } else {
                    uniqueMap.set(key, s);
                }
            });

            console.log(`Found ${idsToDelete.length} duplicates to delete.`);

            // 3. Delete Duplicates in chunks
            const chunkSize = 200;
            if (idsToDelete.length > 0) {
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

    // [New] Cleanup Tool for Non-Radiographer Shifts
    async cleanupNonRadiographerShifts(startDate: string, endDate: string) {
        console.log(`Cleaning up non-radiographer shifts from ${startDate} to ${endDate}...`);
        try {
            // Find all users who are NOT radiographers
            const nonRadUserIds = this.users.filter(u => u.isRadiographer === false).map(u => u.id);
            if (nonRadUserIds.length === 0) return 0;

            // Find all shifts in the range belonging to these users
            const shiftsToDelete = this.shifts.filter(s => 
                s.date >= startDate && 
                s.date <= endDate && 
                nonRadUserIds.includes(s.userId)
            );

            if (shiftsToDelete.length === 0) return 0;

            const idsToDelete = shiftsToDelete.map(s => s.id);
            console.log(`Found ${idsToDelete.length} invalid shifts to delete.`);

            // Delete in chunks
            const chunkSize = 200;
            for (let i = 0; i < idsToDelete.length; i += chunkSize) {
                const chunk = idsToDelete.slice(i, i + chunkSize);
                const { error: delError } = await supabase.from('shifts').delete().in('id', chunk);
                if (delError) console.error('Delete chunk failed:', delError);
            }

            // Refresh Local State
            this.shifts = this.shifts.filter(s => !idsToDelete.includes(s.id));
            this.notifyListeners();
            return idsToDelete.length;
        } catch (e) {
            console.error('Non-radiographer cleanup failed:', e);
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
            .channel('db_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, (payload) => this.handleRealtimeShiftUpdate(payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'health_mgmt_shifts' }, (payload) => this.handleRealtimeHMShiftUpdate(payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'health_mgmt_staff' }, (payload) => this.handleRealtimeHMStaffUpdate(payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => this.handleRealtimeUserUpdate(payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'doctors' }, (payload) => this.handleRealtimeDoctorUpdate(payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'doctor_shifts' }, (payload) => this.handleRealtimeDoctorShiftUpdate(payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leaves' }, (payload) => this.handleRealtimeLeaveUpdate(payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => this.handleRealtimeSettingsUpdate(payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'anesthesia_staff' }, (payload) => this.handleRealtimeAnesStaffUpdate(payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'anesthesia_shifts' }, (payload) => this.handleRealtimeAnesShiftUpdate(payload))
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[Realtime] Subscribed to all database changes');
                }
            });
    }

    private handleRealtimeShiftUpdate(payload: any) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        const record = { ...newRecord };
        if (record.id) this.mapFromDbFields(record);

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const index = this.shifts.findIndex(s => s.id === record.id);
            if (index !== -1) {
                this.shifts[index] = record as Shift;
            } else {
                // Check for optimistic match by userId and date if it was an INSERT
                const slotIndex = this.shifts.findIndex(s => s.userId === record.userId && s.date === record.date);
                if (slotIndex >= 0) {
                    this.shifts[slotIndex] = record as Shift;
                } else {
                    this.shifts.push(record as Shift);
                }
            }
            this.notifyListeners();
        } else if (eventType === 'DELETE') {
            this.shifts = this.shifts.filter(s => s.id !== oldRecord.id);
            this.notifyListeners();
        }
    }

    private handleRealtimeAnesStaffUpdate(payload: any) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const mapped = {
                id: newRecord.id,
                name: newRecord.name,
                alias: newRecord.alias,
                isActive: newRecord.is_active,
                locations: newRecord.locations || [],
                role: newRecord.role
            };
            const index = this.anesthesiaStaff.findIndex(s => s.id === mapped.id);
            if (index !== -1) this.anesthesiaStaff[index] = mapped; else this.anesthesiaStaff.push(mapped);
        } else if (eventType === 'DELETE') {
            this.anesthesiaStaff = this.anesthesiaStaff.filter(s => s.id !== oldRecord.id);
        }
        this.notifyListeners();
    }

    private handleRealtimeAnesShiftUpdate(payload: any) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const mapped = {
                ...newRecord,
                userId: newRecord.user_id,
                workTime: newRecord.work_time,
                scheduled_station: newRecord.scheduled_station
            };
            const index = this.anesthesiaShifts.findIndex(s => s.id === mapped.id);
            if (index !== -1) this.anesthesiaShifts[index] = mapped; else this.anesthesiaShifts.push(mapped);
        } else if (eventType === 'DELETE') {
            this.anesthesiaShifts = this.anesthesiaShifts.filter(s => s.id !== oldRecord.id);
        }
        this.notifyListeners();
    }

    private handleRealtimeHMShiftUpdate(payload: any) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        const record = { ...newRecord };
        if (record.id) this.mapFromDbFields(record);

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            // Unpack location
            let task = record.task || '';
            let location = undefined;
            if (task.includes('@@')) {
                const parts = task.split('@@');
                task = parts[0];
                location = parts[1];
            }
            if (task === '') task = undefined;
            record.task = task;
            record.location = location;

            const index = this.healthMgmtShifts.findIndex(s => s.id === record.id);
            if (index !== -1) {
                this.healthMgmtShifts[index] = record as HealthMgmtShift;
            } else {
                const slotIndex = this.healthMgmtShifts.findIndex(s => s.userId === record.userId && s.date === record.date);
                if (slotIndex >= 0) {
                    this.healthMgmtShifts[slotIndex] = record as HealthMgmtShift;
                } else {
                    this.healthMgmtShifts.push(record as HealthMgmtShift);
                }
            }
            this.notifyListeners();
        } else if (eventType === 'DELETE') {
            this.healthMgmtShifts = this.healthMgmtShifts.filter(s => s.id !== oldRecord.id);
            this.notifyListeners();
        }
    }

    private handleRealtimeHMStaffUpdate(payload: any) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const index = this.healthMgmtStaff.findIndex(s => s.id === newRecord.id);
            if (index !== -1) {
                this.healthMgmtStaff[index] = {
                    ...newRecord,
                    isActive: newRecord.is_active,
                    role: newRecord.role,
                    location: newRecord.location
                } as HealthMgmtStaff;
            } else {
                this.healthMgmtStaff.push({
                    id: newRecord.id,
                    name: newRecord.name,
                    alias: newRecord.alias,
                    isActive: newRecord.is_active,
                    role: newRecord.role || 'VIEWER',
                    location: newRecord.location
                });
            }
            this.notifyListeners();
        } else if (eventType === 'DELETE') {
            this.healthMgmtStaff = this.healthMgmtStaff.filter(s => s.id !== oldRecord.id);
            this.notifyListeners();
        }
    }

    private handleRealtimeUserUpdate(payload: any) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        const record = { ...newRecord };
        if (record.id) this.mapFromDbFields(record);

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const index = this.users.findIndex(u => u.id === record.id);
            if (index !== -1) {
                this.users[index] = { 
                    ...record as User,
                    permissions: record.permissions || getPermissionsByRole(record.role)
                };
            } else {
                this.users.push({
                    ...record as User,
                    permissions: record.permissions || getPermissionsByRole(record.role)
                });
            }
            this.notifyListeners();
        } else if (eventType === 'DELETE') {
            this.users = this.users.filter(u => u.id !== oldRecord.id);
            this.notifyListeners();
        }
    }

    private handleRealtimeDoctorUpdate(payload: any) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        const record = { ...newRecord };
        if (record.id) {
            // Doctors mapping is slightly different in initializeData
            const mapped = {
                ...record,
                capabilities: record.capabilities || [],
                locations: record.locations || [],
                excludedDays: record.excluded_days || [],
                excludedAutoScheduleLocations: record.excluded_auto_schedule_locations || [],
                isPartTime: record.is_part_time || false,
                monthlyTargetShifts: record.monthly_target_shifts,
                displayOrder: record.display_order,
                fixedShifts: record.fixed_shifts || [],
                personalCycles: record.personal_cycles,
                isActive: record.is_active !== false,
                weekdaySettings: (record.weekday_settings || []).map((s: any) => ({
                    dayOfWeek: s.dayOfWeek,
                    workTime: s.workTime,
                    task: s.task || s.memo
                }))
            };

            if (eventType === 'INSERT' || eventType === 'UPDATE') {
                const index = this.doctors.findIndex(d => d.id === mapped.id);
                if (index !== -1) {
                    this.doctors[index] = mapped as Doctor;
                } else {
                    this.doctors.push(mapped as Doctor);
                }
                this.notifyListeners();
            }
        }
        
        if (eventType === 'DELETE') {
            this.doctors = this.doctors.filter(d => d.id !== oldRecord.id);
            this.notifyListeners();
        }
    }

    private handleRealtimeDoctorShiftUpdate(payload: any) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        const record = { ...newRecord };
        if (record.id) {
            const mapped = {
                ...record,
                doctorId: record.doctor_id || record.doctorId,
                explanationTaskType: record.explanation_task_type || record.explanationTaskType,
                workTime: record.work_time || record.workTime,
            };

            if (eventType === 'INSERT' || eventType === 'UPDATE') {
                const index = this.doctorShifts.findIndex(s => s.id === mapped.id);
                if (index !== -1) {
                    this.doctorShifts[index] = mapped as DoctorShift;
                } else {
                    this.doctorShifts.push(mapped as DoctorShift);
                }
                this.notifyListeners();
            }
        }

        if (eventType === 'DELETE') {
            this.doctorShifts = this.doctorShifts.filter(s => s.id !== oldRecord.id);
            this.notifyListeners();
        }
    }

    private handleRealtimeLeaveUpdate(payload: any) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        const record = { ...newRecord };
        if (record.id) this.mapFromDbFields(record);

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const index = this.leaves.findIndex(l => l.id === record.id);
            if (index !== -1) {
                this.leaves[index] = record as LeaveRequest;
            } else {
                this.leaves.push(record as LeaveRequest);
            }
            this.notifyListeners();
        } else if (eventType === 'DELETE') {
            this.leaves = this.leaves.filter(l => l.id !== oldRecord.id);
            this.notifyListeners();
        }
    }

    private handleRealtimeSettingsUpdate(payload: any) {
        const { eventType, new: newRecord } = payload;
        if (eventType === 'UPDATE' || eventType === 'INSERT') {
            if (newRecord.id === this.settingsRowId) {
                this.settings = { ...this.settings, ...newRecord.data };
                this.notifyListeners();
            }
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
        if (!this.settings.cycleAnchors) this.settings.cycleAnchors = [];
        if (!this.settings.holidays) {
            this.settings.holidays = [];
        } else {
            this.settings.holidays = this.settings.holidays.map(h => ({
                ...h,
                id: h.id || `${h.date}-${h.name}-${h.type}`,
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

        if (!this.settings.healthMgmtStations) {
            this.settings.healthMgmtStations = ['H', 'G', '櫃1', '櫃2', '櫃3', '櫃助', '營1', '營2', '行政班'];
        }

        if (!this.settings.healthMgmtTasks) {
            this.settings.healthMgmtTasks = ['主控', '輔控', '晚班', '排班', 'call班'];
        }

        if (!this.settings.healthMgmtCycles) {
            this.settings.healthMgmtCycles = [];
        }
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
            await supabase.from('users').update({ password: newPass, must_change_password: false }).eq('id', userId);
        }
    }

    async resetPassword(userId: string) {
        const u = this.users.find(u => u.id === userId);
        if (u) {
            u.password = '1234';
            u.mustChangePassword = true; // Force change on next login
            // Sync DB
            await supabase.from('users').update({ password: '1234', must_change_password: true }).eq('id', userId);
        }
    }

    async updateUserPassword(userId: string, newPass: string) {
        const u = this.users.find(u => u.id === userId);
        if (u) {
            u.password = newPass;
            u.mustChangePassword = false;
            await supabase.from('users').update({ password: newPass, must_change_password: false }).eq('id', userId);
        }
    }

    // Users
    getUsers() {
        if (!this.settings.userDisplayOrder || this.settings.userDisplayOrder.length === 0) {
            return [...this.users];
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
        const userToSave = {
            ...user,
            permissions: user.permissions !== undefined ? user.permissions : getPermissionsByRole(user.role)
        };
        // 轉換為 DB 格式
        const dbUser: any = { ...userToSave };
        this.mapToDbFields(dbUser);

        const { error } = await supabase.from('users').insert(dbUser);
        if (error) {
            console.error('Failed to add user to Supabase:', error);
            throw error;
        }
        
        this.users.push(userToSave);
        this.notifyListeners();
    }

    private mapToDbFields(obj: any) {
        const mapping: Record<string, string> = {
            'isRadiographer': 'is_radiographer',
            'isPartTime': 'is_part_time',
            'isHealthMgmt': 'is_health_mgmt',
            'healthMgmtLocation': 'health_mgmt_location',
            'isActive': 'is_active',
            'resignationDate': 'resignation_date',
            'groupIndex': 'group_index',
            'groupId': 'group_id',
            'mustChangePassword': 'must_change_password',
            'avatarUrl': 'avatar_url',
            'personalCycles': 'personal_cycles',
            'primaryStation': 'primary_station',
            'learningCapabilities': 'learning_capabilities',
            'excludedCapabilities': 'excluded_capabilities',
            'specialRoles': 'special_roles',
            'userId': 'userId', // Already mixed in DB, but let's be safe
            'targetUserId': 'target_user_id',
            'returnDate': 'return_date',
            'approverId': 'approver_id',
            'processedAt': 'processed_at',
            'roleToSwap': 'role_to_swap',
            'targetApproval': 'target_approval',
            'permissions': 'permissions'
        };
        Object.keys(mapping).forEach(key => {
            if (key in obj && key !== mapping[key]) {
                obj[mapping[key]] = obj[key];
                delete obj[key];
            }
        });
    }

    private mapFromDbFields(obj: any) {
        const mapping: Record<string, string> = {
            'is_radiographer': 'isRadiographer',
            'is_part_time': 'isPartTime',
            'is_health_mgmt': 'isHealthMgmt',
            'health_mgmt_location': 'healthMgmtLocation',
            'is_active': 'isActive',
            'resignation_date': 'resignationDate',
            'group_index': 'groupIndex',
            'group_id': 'groupId',
            'must_change_password': 'mustChangePassword',
            'avatar_url': 'avatarUrl',
            'personal_cycles': 'personalCycles',
            'primary_station': 'primaryStation',
            'learning_capabilities': 'learningCapabilities',
            'excluded_capabilities': 'excludedCapabilities',
            'special_roles': 'specialRoles',
            'target_user_id': 'targetUserId',
            'return_date': 'returnDate',
            'approver_id': 'approverId',
            'processed_at': 'processedAt',
            'role_to_swap': 'roleToSwap',
            'target_approval': 'targetApproval',
            'permissions': 'permissions',
            'user_id': 'userId'
        };
        Object.keys(mapping).forEach(key => {
            if (key in obj) {
                obj[mapping[key]] = obj[key];
                // Keep the old key too for backward compatibility if needed? 
                // No, better to be clean
            }
        });
    }

    async updateUser(id: string, updates: Partial<User>) {
        this.users = this.users.map(u => u.id === id ? { ...u, ...updates } : u);
        
        const dbUpdates: any = { ...updates };
        this.mapToDbFields(dbUpdates);

        const { error } = await supabase.from('users').update(dbUpdates).eq('id', id);
        if (error) {
            console.error('Failed to update user in Supabase:', error);
            throw error;
        }
        
        this.notifyListeners();
    }

    async deleteUser(id: string) {
        // Soft delete: set isActive to false instead of removing the record
        const user = this.users.find(u => u.id === id);
        if (user) {
            user.isActive = false;
            // Sync to DB
            const { error } = await supabase
                .from('users')
                .update({ is_active: false })
                .eq('id', id);
            
            if (error) {
                console.error('Failed to soft delete user in Supabase:', error);
                throw error;
            }

            // [User Request] Cascade delete: Remove all shifts associated with this user
            try {
                const { error: shiftDelError } = await supabase
                    .from('shifts')
                    .delete()
                    .eq('user_id', id);
                    
                if (shiftDelError) {
                    console.error('Failed to delete user shifts in Supabase:', shiftDelError);
                } else {
                    // Remove from local state
                    this.shifts = this.shifts.filter(s => s.userId !== id);
                }
            } catch (e) {
                console.error('Cascade delete shifts exception:', e);
            }

            this.notifyListeners();
        }
    }

    // --- Health Mgmt Staff Operations ---
    
    getHealthMgmtStaff() {
        return [...this.healthMgmtStaff];
    }

    async addHealthMgmtStaff(staff: HealthMgmtStaff) {
        const { error } = await supabase.from('health_mgmt_staff').insert({
            id: staff.id,
            name: staff.name,
            alias: staff.alias,
            is_active: staff.isActive,
            role: staff.role || 'VIEWER',
            location: staff.location
        });
        if (error) {
            console.error('Failed to add health mgmt staff to Supabase:', error);
            throw error;
        }
        
        this.healthMgmtStaff = [...this.healthMgmtStaff, staff];
        this.notifyListeners();
    }

    async updateHealthMgmtStaff(id: string, updates: Partial<HealthMgmtStaff>) {
        this.healthMgmtStaff = this.healthMgmtStaff.map(s => s.id === id ? { ...s, ...updates } : s);
        
        const dbUpdates: any = {};
        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.alias !== undefined) dbUpdates.alias = updates.alias;
        if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
        if (updates.role !== undefined) dbUpdates.role = updates.role;
        if (updates.location !== undefined) dbUpdates.location = updates.location;

        if (Object.keys(dbUpdates).length > 0) {
            const { error } = await supabase.from('health_mgmt_staff').update(dbUpdates).eq('id', id);
            if (error) {
                console.error('Failed to update health mgmt staff in Supabase:', error);
                throw error;
            }
        }
        this.notifyListeners();
    }

    async deleteHealthMgmtStaff(id: string) {
        // Soft delete for HM staff too
        const staff = this.healthMgmtStaff.find(s => s.id === id);
        if (staff) {
            staff.isActive = false;
            const { error } = await supabase
                .from('health_mgmt_staff')
                .update({ is_active: false })
                .eq('id', id);
            
            if (error) {
                console.error('Failed to soft delete health mgmt staff in Supabase:', error);
                throw error;
            }
            this.notifyListeners();
        }
    }

    // --- Anesthesia Staff Management ---
    getAnesthesiaStaff() {
        return [...this.anesthesiaStaff];
    }

    async addAnesthesiaStaff(staff: AnesthesiaStaff) {
        console.log('[Store] Adding anesthesia staff:', staff);
        const { error } = await supabase.from('anesthesia_staff').insert({
            id: staff.id,
            name: staff.name,
            alias: staff.alias,
            is_active: staff.isActive,
            locations: staff.locations || [],
            role: staff.role || 'VIEWER'
        });
        if (error) {
            console.error('[Store] addAnesthesiaStaff Supabase error:', error);
            throw error;
        }
        console.log('[Store] addAnesthesiaStaff success');
        this.anesthesiaStaff.push(staff);
        this.notifyListeners();
    }

    async updateAnesthesiaStaff(id: string, updates: Partial<AnesthesiaStaff>) {
        console.log('[Store] Updating anesthesia staff:', id, updates);
        const dbUpdates: any = {};
        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.alias !== undefined) dbUpdates.alias = updates.alias;
        if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
        if (updates.locations !== undefined) dbUpdates.locations = updates.locations;
        if (updates.role !== undefined) dbUpdates.role = updates.role;

        const { error } = await supabase.from('anesthesia_staff').update(dbUpdates).eq('id', id);
        if (error) {
            console.error('[Store] updateAnesthesiaStaff Supabase error:', error);
            throw error;
        }
        console.log('[Store] updateAnesthesiaStaff success');

        const index = this.anesthesiaStaff.findIndex(s => s.id === id);
        if (index !== -1) {
            this.anesthesiaStaff[index] = { ...this.anesthesiaStaff[index], ...updates };
            this.notifyListeners();
        }
    }

    async deleteAnesthesiaStaff(id: string) {
        // Soft delete
        const staff = this.anesthesiaStaff.find(s => s.id === id);
        if (staff) {
            staff.isActive = false;
            const { error } = await supabase
                .from('anesthesia_staff')
                .update({ is_active: false })
                .eq('id', id);
            
            if (error) {
                console.error('Failed to soft delete anesthesia staff in Supabase:', error);
                throw error;
            }
            this.notifyListeners();
        }
    }

    // --- Anesthesia Shifts ---
    getAnesthesiaShifts() {
        return [...this.anesthesiaShifts];
    }

    async assignAnesthesiaShift(userId: string, date: string, station: string, location?: string, task?: string, workTime?: string, note?: string) {
        let shift = this.anesthesiaShifts.find(s => s.userId === userId && s.date === date);
        const id = shift ? shift.id : generateUUID();

        if (station === '') {
            // Delete if station is empty
            if (shift) {
                const { error } = await supabase.from('anesthesia_shifts').delete().eq('id', id);
                if (error) throw error;
                this.anesthesiaShifts = this.anesthesiaShifts.filter(s => s.id !== id);
            }
        } else {
            const dbData = {
                id,
                user_id: userId,
                date,
                station,
                location,
                task,
                work_time: workTime,
                note
            };

            const { error } = await supabase.from('anesthesia_shifts').upsert(dbData);
            if (error) throw error;

            if (shift) {
                Object.assign(shift, { station, location, task, workTime, note });
            } else {
                this.anesthesiaShifts.push({ id, userId, date, station, location, task, workTime, note });
            }
        }
        this.notifyListeners();
    }

    // -------------------------------------------------------------------------------- //
    // Shifts
    getShifts(startDate: string, endDate: string) {
        if (!startDate && !endDate) return [...this.shifts];
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
                const newId = generateUUID();
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

    // --- Health Mgmt Shift Operations ---
    
    getHealthMgmtShifts(startDate?: string, endDate?: string) {
        if (!startDate && !endDate) return [...this.healthMgmtShifts];
        return this.healthMgmtShifts.filter(s => s.date >= (startDate || '') && s.date <= (endDate || '9999'));
    }

    async upsertHealthMgmtShift(shift: HealthMgmtShift) {
        // 1. Local state update: Optimistic update
        const index = this.healthMgmtShifts.findIndex(s => s.userId === shift.userId && s.date === shift.date);
        if (index >= 0) {
            this.healthMgmtShifts[index] = { ...shift };
        } else {
            this.healthMgmtShifts.push({ ...shift });
        }
        this.notifyListeners();

        // 2. Remote sync
        try {
            // Prepare DB record with explicit mapping
            // Pack location into task
            const packedTask = shift.location ? `${shift.task || ''}@@${shift.location}` : (shift.task || null);

            const dbRecord: any = {
                date: shift.date,
                station: shift.station || '',
                task: packedTask,
                userId: shift.userId // Supabase table uses 'userId' (CamelCase) for this table specifically
            };

            const { data: existing, error: fetchError } = await supabase
                .from('health_mgmt_shifts')
                .select('id')
                .eq('userId', shift.userId)
                .eq('date', shift.date);

            if (fetchError) throw fetchError;

            let targetId: string;

            if (existing && existing.length > 0) {
                targetId = existing[0].id;
                const { error: updateError } = await supabase
                    .from('health_mgmt_shifts')
                    .update({ ...dbRecord, id: targetId })
                    .eq('id', targetId);
                
                if (updateError) throw updateError;

                // Cleanup duplicates if any
                if (existing.length > 1) {
                    const extras = existing.slice(1).map(e => e.id);
                    await supabase.from('health_mgmt_shifts').delete().in('id', extras);
                }
            } else {
                targetId = generateUUID();
                const { error: insertError } = await supabase
                    .from('health_mgmt_shifts')
                    .insert({ ...dbRecord, id: targetId });
                
                if (insertError) throw insertError;
            }

            // 3. Sync local ID
            const finalIndex = this.healthMgmtShifts.findIndex(s => s.userId === shift.userId && s.date === shift.date);
            if (finalIndex >= 0) {
                this.healthMgmtShifts[finalIndex].id = targetId;
            } else {
                console.warn('[Store] HM shift not found in local memory after DB sync. Date:', shift.date, 'User:', shift.userId);
            }

        } catch (err) {
            console.error('[Store] Failed to upsert HM shift:', err);
            throw err;
        }
    }

    async deleteHealthMgmtShift(userId: string, date: string) {
        this.healthMgmtShifts = this.healthMgmtShifts.filter(s => !(s.userId === userId && s.date === date));
        this.notifyListeners();

        try {
            await supabase.from('health_mgmt_shifts').delete().eq('userId', userId).eq('date', date);
        } catch (err) {
            console.error('Failed to delete HM shift:', err);
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

                // We rely on local state since applyLeaveToShifts runs after initializeData
                // and local updates keep it fresh. Removing the per-date DB fetch to improve performance.


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
    getStations(): string[] {
        return this.settings.stations;
    }

    getHealthMgmtStations(): string[] {
        return this.settings.healthMgmtStations || ['H', 'G', '櫃1', '櫃2', '櫃3', '櫃助', '營1', '營2', '行政班'];
    }

    async updateHealthMgmtStations(stations: string[]) {
        this.settings.healthMgmtStations = stations;
        await this.saveSettings();
        this.notifyListeners();
    }

    getHealthMgmtTasks(): string[] {
        return this.settings.healthMgmtTasks || ['主控', '輔控', '晚班', '排班', 'call班'];
    }

    async updateHealthMgmtTasks(tasks: string[]) {
        this.settings.healthMgmtTasks = tasks;
        await this.saveSettings();
        this.notifyListeners();
    }

    getHealthMgmtCycles(): RosterCycle[] {
        return this.settings.healthMgmtCycles || [];
    }

    async addHealthMgmtCycle(cycle: RosterCycle) {
        if (!this.settings.healthMgmtCycles) this.settings.healthMgmtCycles = [];
        this.settings.healthMgmtCycles.unshift(cycle);
        await this.saveSettings();
        this.notifyListeners();
    }

    async deleteHealthMgmtCycle(id: string) {
        if (!this.settings.healthMgmtCycles) return;
        this.settings.healthMgmtCycles = this.settings.healthMgmtCycles.filter(c => c.id !== id);
        await this.saveSettings();
        this.notifyListeners();
    }

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
        // Check for exact duplicate (date + name + type) to avoid double-adding
        if (!this.settings.holidays.some(h => h.date === holiday.date && h.name === holiday.name && h.type === holiday.type)) {
            const newHoliday = { ...holiday, id: holiday.id || `h-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` };
            this.settings.holidays.push(newHoliday);
            this.settings.holidays.sort((a, b) => a.date.localeCompare(b.date));
            await this.saveSettings();
        }
    }

    async removeHoliday(id: string) {
        if (this.settings.holidays) {
            // First try removing by ID
            const initialCount = this.settings.holidays.length;
            this.settings.holidays = this.settings.holidays.filter(h => h.id !== id);
            
            // Fallback for legacy calls that pass 'date': remove all on that date if ID didn't match anything
            if (this.settings.holidays.length === initialCount) {
                this.settings.holidays = this.settings.holidays.filter(h => h.date !== id);
            }
            
            await this.saveSettings();
        }
    }

    async removeHolidaysByDateAndType(date: string, type: DateEventType) {
        if (this.settings.holidays) {
            this.settings.holidays = this.settings.holidays.filter(h => !(h.date === date && h.type === type));
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

        // Check Resignation Date
        if (user.isActive === false && user.resignationDate) {
            if (dateStr > user.resignationDate) {
                return 'OFF';
            }
        } else if (user.isActive === false && !user.resignationDate) {
             // If resigned but no date... assume effective immediately? 
             // Or maybe they are just "Inactive" generally. 
             // Logic in Dashboard allows them if they have shifts.
             // But for NEW assignments, they should be OFF.
        }

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

        // Part-Time users skip Group Cycle logic entirely
        if (!user.isPartTime) {
            // --- Group D: Rolling Rotation (Sun off, Mon-Sat rotate by fixed index) ---
            if (user.groupId === StaffGroup.GROUP_D) {
                const d = new Date(dateStr + 'T00:00:00');
                // Sunday is always OFF
                if (d.getDay() === 0) {
                    return 'OFF';
                }

                // Count non-Sunday days from cycle start to (but not including) dateStr
                const refStr = this.settings.cycleStartDate || '2024-01-01';
                const ref = new Date(refStr + 'T00:00:00');
                const nonSundayCount = countNonSundayDays(ref, d);

                // Fixed index: groupIndex 0-3 for 4-person D group
                const myIndex = user.groupIndex ?? 0;
                const groupSize = 4;
                const result = nonSundayCount % groupSize === myIndex ? 'OFF' : 'WORK';
                return result;
            }

            // --- Groups A/B/C: existing 6-day cycle logic ---
            const baseStatus = this.calculateBaseStatus(dateStr, user.groupId);
            if (baseStatus === SYSTEM_OFF) {
                return 'OFF';
            }
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
            dazhi_clients: 0,
            beitou_gi: 0,
            beitou_mr: 0,
            dazhi_gi: 0,
            beitou_total: 0,
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

    async addDoctor(name: string, alias?: string, capabilities: string[] = [], locations: string[] = [], excludedDays: number[] = [], excludedAutoScheduleLocations: string[] = [], isPartTime: boolean = false, specialty?: string, monthlyTargetShifts?: number, weekdaySettings: WeekdaySetting[] = []): Promise<{ success: boolean; error?: string; id?: string }> {
        const newDoctor: Doctor = { id: generateUUID(), name, alias: alias || name[0], capabilities, locations, excludedDays, excludedAutoScheduleLocations, specialty, isPartTime, monthlyTargetShifts, fixedShifts: [], weekdaySettings };
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
                monthly_target_shifts: newDoctor.monthlyTargetShifts,
                is_active: true, // New doctors are active
                fixed_shifts: [],
                weekday_settings: weekdaySettings,
                personal_cycles: newDoctor.personalCycles
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
                display_order: doctor.displayOrder,
                fixed_shifts: doctor.fixedShifts,
                weekday_settings: doctor.weekdaySettings,
                personal_cycles: doctor.personalCycles,
                is_active: doctor.isActive
            }).eq('id', doctor.id);
            if(error) throw error;
         } catch(error: any) {
             console.error('Failed to update doctor:', error);
             if (error.message?.includes('Failed to fetch') || error.message?.includes('fetch') || this.connectionStatus.type === 'Mock') {
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
        // Soft delete: update isActive instead of removing
        const doctor = this.doctors.find(d => d.id === id);
        if (doctor) {
            doctor.isActive = false;
            this.notifyListeners();

            try {
                const { error } = await supabase.from('doctors').update({ is_active: false }).eq('id', id);
                if (error) throw error;
            } catch (e: any) {
                console.error('Failed to soft delete doctor:', e);
                // We keep the local state as false even if remote fails (optimistic) 
                // unless we want to revert for data parity. 
                // But generally users expect 'deleted' to stay deleted.
            }
        }
    }




    // --- Doctor Schedule ---

    getDoctorShifts() {
        return [...this.doctorShifts];
    }

    async refreshDoctorShifts() {
        console.log('[Store] Refreshing Doctor Shifts...');
        const { data } = await this.fetchAllDoctorShifts();
        if (data) {
            this.doctorShifts = data.map((s: any) => ({
                ...s,
                doctorId: s.doctor_id || s.doctorId,
                explanationTaskType: s.explanation_task_type || s.explanationTaskType,
                workTime: s.work_time || s.workTime,
                note: s.note,
                location: s.location,
                task: s.task,
                scheduled_station: s.scheduled_station
            }));
            this.notifyListeners();
        }
    }
    
    getDoctorShift(doctorId: string, date: string) {
        return this.doctorShifts.find(s => s.doctorId === doctorId && s.date === date);
    }

    async assignDoctor(doctorId: string, date: string, station: string, workTime?: string, note?: string, location?: string, task?: string) {
        // Remove existing shift for this doctor on this date if any
        let shift = this.doctorShifts.find(s => s.doctorId === doctorId && s.date === date);
        const oldStation = shift ? shift.station : undefined;
        
        let targetId: string;
        
        if (shift) {
            targetId = shift.id;
            shift.station = station;
            shift.workTime = workTime;
            shift.note = note;
            shift.location = location;
            shift.task = task;
        } else {
            targetId = generateUUID();
            shift = { id: targetId, doctorId, date, station, workTime, note, location, task };
            this.doctorShifts.push(shift);
        }
        
        try {
            // Check for existing records in DB to prevent duplicates on partial fetch
            const { data: existing, error: fetchError } = await supabase
                .from('doctor_shifts')
                .select('id')
                .eq('doctor_id', doctorId)
                .eq('date', date);
                
            if (fetchError) throw fetchError;
            
            if (existing && existing.length > 0) {
                targetId = existing[0].id;
                shift.id = targetId; // Sync local ID
                
                await supabase.from('doctor_shifts')
                    .update({ station, work_time: workTime, note, location, task })
                    .eq('id', targetId);
                    
                // Clean up duplicates
                if (existing.length > 1) {
                    const idsToDelete = existing.slice(1).map(e => e.id);
                    await supabase.from('doctor_shifts').delete().in('id', idsToDelete);
                }
            } else {
                await supabase.from('doctor_shifts').insert({ 
                    id: targetId,
                    doctor_id: doctorId,
                    date: date,
                    station: station,
                    work_time: workTime,
                    note: note,
                    location: location,
                    task: task
                });
            }
        } catch(e) { console.warn('Supabase operation failed, using local', e); }
        
        // Auto-pair Gynecology + Explanation
        await this.autoPairGynecologyWithExplanation(doctorId, date, station);
        
        // **影像雲同步**: 智慧連動 - 僅在地點變動或從「影像類任務」換成「非影像任務」時才清除
        const isStillImaging = this.shouldPreserveCloudSchedule(shift, { station, location, task });
        if (oldStation !== undefined && oldStation !== station && !isStillImaging) {
            // 如果新任務完全不是影像類（例如「行政」或「未分配」），則直接刪除該表記錄以防統計誤差
            const isNone = !station || station === '未分配' || station === 'X';
            if (isNone) {
                await this.deleteCloudScheduleEntry(date, doctorId);
            } else {
                await this.clearCloudScheduleHelpers(date, doctorId);
            }
        }

        this.notifyListeners();
    }

    // New: Specific method for updating Physicians Schedule (CT, MR, US)
    // This updates 'scheduled_station' column, leaving 'station' (Manpower Allocation) untouched if possible
    async assignDoctorSchedule(doctorId: string, date: string, scheduledStation: string, workTime?: string, note?: string, location?: string, task?: string) {
        let shift = this.doctorShifts.find(s => s.doctorId === doctorId && s.date === date);
        const oldScheduledStation = shift ? shift.scheduled_station : undefined;
        
        let targetId: string;

        if (shift) {
            targetId = shift.id;
            shift.scheduled_station = scheduledStation;
            // Also update other metadata if provided
            if (workTime !== undefined) shift.workTime = workTime;
            if (note !== undefined) shift.note = note;
            if (location !== undefined) shift.location = location;
            if (task !== undefined) shift.task = task;
        } else {
            targetId = generateUUID();
            shift = { 
                id: targetId, 
                doctorId, 
                date, 
                station: '未分配', 
                scheduled_station: scheduledStation,
                workTime, 
                note, 
                location, 
                task 
            };
            this.doctorShifts.push(shift);
        }

        try {
            const { data: existing, error: fetchError } = await supabase
                .from('doctor_shifts')
                .select('id')
                .eq('doctor_id', doctorId)
                .eq('date', date);
                
            if (fetchError) throw fetchError;

            if (existing && existing.length > 0) {
                targetId = existing[0].id;
                shift.id = targetId; 

                const dbUpdates: any = { scheduled_station: scheduledStation };
                if (workTime !== undefined) dbUpdates.work_time = workTime;
                if (note !== undefined) dbUpdates.note = note;
                if (location !== undefined) dbUpdates.location = location;
                if (task !== undefined) dbUpdates.task = task;

                const { error: updateError } = await supabase.from('doctor_shifts')
                    .update(dbUpdates)
                    .eq('id', targetId);
                
                if (updateError) {
                    console.error('[Store] Update Error:', updateError);
                    alert(`儲存失敗: ${updateError.message}\n請確認已執行 SQL 腳本`);
                }

                if (existing.length > 1) {
                    const idsToDelete = existing.slice(1).map(e => e.id);
                    await supabase.from('doctor_shifts').delete().in('id', idsToDelete);
                }
            } else {
                const { error: insertError } = await supabase.from('doctor_shifts').insert({ 
                    id: targetId,
                    doctor_id: doctorId, 
                    date: date,
                    station: shift.station,
                    scheduled_station: scheduledStation,
                    work_time: workTime,
                    note: note,
                    location: location,
                    task: task,
                    is_auto_generated: false
                }); 
                
                if (insertError) {
                    console.error('[Store] Insert Error:', insertError);
                    alert(`新增失敗: ${insertError.message}\n請確認已執行 SQL 腳本`);
                }
            }
        } catch(e) { console.warn('Supabase operation failed, using local', e); }

        // **影像雲同步**: 智慧連動 - 僅在地點變動或任務性質改變時才清除
        const isStillImaging = this.shouldPreserveCloudSchedule(shift, { scheduled_station: scheduledStation, location, task });
        if (oldScheduledStation !== undefined && oldScheduledStation !== scheduledStation && !isStillImaging) {
            // 如果新任務完全不是影像類（例如「行政」或「未分配」），則直接刪除該表記錄以防統計誤差
            const isNone = !scheduledStation || scheduledStation === '未分配' || scheduledStation === 'X';
            if (isNone) {
                await this.deleteCloudScheduleEntry(date, doctorId);
            } else {
                await this.clearCloudScheduleHelpers(date, doctorId);
            }
        }

        this.notifyListeners();
    }
    
    async removeDoctorFromStation(doctorId: string, date: string) {
        const shift = this.doctorShifts.find(s => s.doctorId === doctorId && s.date === date);
        if (shift) {
            this.doctorShifts = this.doctorShifts.filter(s => s.id !== shift.id);
            await supabase.from('doctor_shifts').delete().eq('id', shift.id);
            // **影像雲同步**: 醫師完全被移除，直接刪除影像雲班表的該日記號
            await this.deleteCloudScheduleEntry(date, doctorId);
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
            const temp = array[i];
            array[i] = array[j];
            array[j] = temp;
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
            id: generateUUID(),
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
        // Use custom specialty order from settings
        const specialtyOrder = this.settings.doctorSpecialties || ['影像醫學部', '家醫科', '腸胃科', '其他'];
        
        const getRank = (doc: Doctor) => {
            let rank = 999;
            const s = (doc.specialty || '').trim();
            if (s) {
                 const idx = specialtyOrder.indexOf(s);
                 if (idx !== -1) {
                     rank = idx;
                 }
            }
            // Part-time penalty (append to end)
            if (doc.isPartTime) {
                rank += 1000;
            }
            return rank;
        };

        const sorted = [...this.doctors].sort((a, b) => {
            const rankA = getRank(a);
            const rankB = getRank(b);
            if (rankA !== rankB) return rankA - rankB;
            // Secondary sort by Name
            return a.name.localeCompare(b.name, 'zh-TW');
        });

        // Apply new order
        this.doctors = sorted.map((d, i) => ({ ...d, displayOrder: i }));
        this.notifyListeners();

        // Persist to DB
        for (const doc of this.doctors) {
            await supabase.from('doctors').update({ display_order: doc.displayOrder }).eq('id', doc.id);
        }
        return true;
    }

    async clearDoctorShifts(startDate: string, endDate: string) {
        // Optimistic
        this.doctorShifts = this.doctorShifts.filter(s => s.date < startDate || s.date > endDate);
        this.cloudScheduleEntries = this.cloudScheduleEntries.filter(e => e.date < startDate || e.date > endDate);
        this.notifyListeners();
        
        try {
            // Delete associated shifts
            const { error: e1 } = await supabase.from('doctor_shifts')
                .delete()
                .gte('date', startDate)
                .lte('date', endDate);

            // Delete associated cloud schedule entries
            const { error: e2 } = await supabase.from('cloud_schedule_entries')
                .delete()
                .gte('date', startDate)
                .lte('date', endDate);
            
            if (e1) console.error('Failed to clear doctor shifts:', e1);
            if (e2) console.error('Failed to clear cloud schedule entries:', e2);
        } catch (e) {
            console.error('Failed to clear data range:', e);
        }
    }

    async autoScheduleDoctors(startDate: string, endDate: string, targetDaysPerDoctor?: Record<string, number>, commit: boolean = true) {
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
        
        // Count existing shifts for this month to respect targets.
        // CRITICAL: Ignore PREVIOUS auto-generated shifts to allow fresh re-calculation.
        const doctorShiftCounts = new Map<string, number>();
        this.doctorShifts.forEach(s => {
             if (s.date >= startDate && s.date <= endDate && !s.isAutoGenerated) {
                 const current = doctorShiftCounts.get(s.doctorId) || 0;
                 doctorShiftCounts.set(s.doctorId, current + 1);
             }
        });
        
        // Map to track local per-day assignments for station quota and double-booking checks
        const dailyAssignedIds = new Map<string, Set<string>>();
        const dailyShiftsForQuota = new Map<string, DoctorShift[]>();

        // --- ROUND 1: Assign ALL Fixed Shifts for the month ---
        // This pass IGNORES station quotas and prioritizes fixed duties
        for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
            const currentD = new Date(t);
            const dateStr = toLocalISOString(currentD);
            const dayOfWeek = currentD.getDay();

            // Honor Clinic Closures
            const event = this.getEvent(dateStr);
            if (event && event.type === DateEventType.CLOSED) continue;

            // Initialize daily tracking with MANUAL shifts only
            const manualInDb = this.doctorShifts.filter(s => s.date === dateStr && !s.isAutoGenerated);
            const assignedSet = new Set(manualInDb.map(s => s.doctorId));
            dailyAssignedIds.set(dateStr, assignedSet);
            dailyShiftsForQuota.set(dateStr, [...manualInDb]);

            for (const doc of this.doctors) {
                if (doc.fixedShifts && doc.fixedShifts.length > 0) {
                    for (const fixed of doc.fixedShifts) {
                         if (fixed.dayOfWeek === dayOfWeek) {
                             if (assignedSet.has(doc.id)) continue;

                             // Enforce Target Limit
                             const currentCount = doctorShiftCounts.get(doc.id) || 0;
                             const target = targetDaysPerDoctor ? (targetDaysPerDoctor[doc.id] ?? 99) : 99;
                             
                             if (currentCount >= target) continue;
                             
                             const ws = doc.weekdaySettings?.find(w => w.dayOfWeek === dayOfWeek);
                            
                            const newFixedShift: DoctorShift = {
                                id: generateUUID(),
                                doctorId: doc.id,
                                date: dateStr,
                                station: fixed.station,
                                scheduled_station: fixed.station,
                                location: fixed.location,
                                workTime: fixed.workTime || ws?.workTime,
                                isAutoGenerated: true,
                                task: ws?.task || '',
                                note: '' // Clear note, as we moved to task
                            };
                             assignments.push(newFixedShift);
                             assignedSet.add(doc.id);
                             doctorShiftCounts.set(doc.id, currentCount + 1);
                             
                             // Important: Track for ROUND 2 quota checks
                             dailyShiftsForQuota.get(dateStr)?.push(newFixedShift);
                         }
                    }
                }
            }
        }

        // --- ROUND 2: Fill Required Station Quotas ---
        for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
            const currentD = new Date(t);
            const dateStr = toLocalISOString(currentD);
            const dayOfWeek = currentD.getDay();

            const event = this.getEvent(dateStr);
            if (event && event.type === DateEventType.CLOSED) continue;

            const assignedDoctorIds = dailyAssignedIds.get(dateStr)!;
            const existingShifts = dailyShiftsForQuota.get(dateStr)!;
            
            const loopStations = this.shuffleArray([...stationsToSchedule]);
            
            for (const stationConfig of loopStations) {
                const stationName = stationConfig.name;
                const stationLocation = stationConfig.location;

                if (['眼科', '耳鼻喉科', '婦科'].includes(stationName)) continue;

                const stationKey = `${stationName}_${stationLocation}`;
                const requirements = this.settings.stationRequirements || {};
                
                let requiredCount = requirements[stationKey]?.[dayOfWeek];
                if (requiredCount === undefined) requiredCount = requirements[stationName]?.[dayOfWeek];
                
                if (requiredCount === undefined || requiredCount === 0) continue;
                
                let currentAssignedCount = existingShifts.filter(s => 
                    (s.scheduled_station || s.station) === stationName && s.location === stationLocation
                ).length;
                
                while (currentAssignedCount < requiredCount) {
                    const potentialCandidates = this.doctors.filter(doc => {
                        if (doc.isPartTime) return false;
                        if (targetDaysPerDoctor && targetDaysPerDoctor[doc.id] === 0) return false;
                        if (!doc.capabilities?.includes(stationName)) return false;
                        if (doc.excludedDays?.includes(dayOfWeek)) return false;
                        if (doc.locations && doc.locations.length > 0 && !doc.locations.includes(stationLocation)) return false;
                        if (doc.excludedAutoScheduleLocations?.includes(stationLocation)) return false;
                        if (assignedDoctorIds.has(doc.id)) return false;

                        const currentCount = doctorShiftCounts.get(doc.id) || 0;
                        const target = targetDaysPerDoctor ? (targetDaysPerDoctor[doc.id] || 0) : 99;
                        return currentCount < target;
                    });

                    if (potentialCandidates.length === 0) break;

                    potentialCandidates.sort((a, b) => {
                        const countA = doctorShiftCounts.get(a.id) || 0;
                        const countB = doctorShiftCounts.get(b.id) || 0;
                        return countA - countB;
                    });

                    const winner = potentialCandidates[0];
                    const ws = winner.weekdaySettings?.find(w => w.dayOfWeek === dayOfWeek);

                    const newShift: DoctorShift = {
                        id: generateUUID(),
                        doctorId: winner.id,
                        date: dateStr,
                        station: stationName,
                        scheduled_station: stationName,
                        location: stationLocation,
                        isAutoGenerated: true,
                        workTime: ws?.workTime,
                        task: ws?.task || ''
                    };

                    assignments.push(newShift);
                    assignedDoctorIds.add(winner.id);
                    existingShifts.push(newShift);
                    const currentCount = doctorShiftCounts.get(winner.id) || 0;
                    doctorShiftCounts.set(winner.id, currentCount + 1);
                    currentAssignedCount++;
                }
            }
        }
        
        // Commit
        if (assignments.length > 0 && commit) {
            this.doctorShifts.push(...assignments);
            try {
                // Batch insert - only include fields that exist in DB
                const { error } = await supabase.from('doctor_shifts').insert(assignments.map(a => {
                    const record: any = {
                        id: a.id,
                        doctor_id: a.doctorId, // Standardized
                        date: a.date,
                        station: a.station,
                        is_auto_generated: a.isAutoGenerated || false,
                        work_time: a.workTime || null
                    };
                    // Add optional fields if they exist
                    if (a.location) {
                        record.location = a.location;
                    }
                    if (a.explanationTaskType) {
                        record.explanation_task_type = a.explanationTaskType;
                    }
                    if (a.scheduled_station) {
                        record.scheduled_station = a.scheduled_station;
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
        if (commit) {
            for (const assignment of assignments) {
                await this.autoPairGynecologyWithExplanation(assignment.doctorId, assignment.date, assignment.station);
            }
        }
        
        return commit ? assignments.length : assignments;

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
                if (user.isActive === false) return false; // Skip resigned users
                if (user.isPartTime) return false; // Skip part-time staff for auto-scheduling
                if (user.isRadiographer === false) return false; // Skip non-radiographers
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



                            // 1. Field Control (場控) Strict Rules
                            // CANNOT have any special role
                            if (slot.includes('場控')) {
                                if (hasAnySpecialRole) return false;
                            }

                            // 2. Remote (遠班/距) Strict Rules
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
                    if (u.isActive === false) return false; // Skip resigned users
                    if (u.isRadiographer === false) return false; // Skip non-radiographers (e.g. admins)
                    if (u.isPartTime) return false; // Skip part-time staff
                    
                    // a. Must be WORKING
                    const status = this.getUserStatusOnDate(u.id, dateStr);
                    if (status !== 'WORK') return false;

                    // b. Must have Capability for the Role
                    // User Request: Users must explicitly have the role checked in user management.
                    const isCertified = u.capabilities?.includes(role);
                    const isLearning = u.learningCapabilities?.includes(role);
                    if (!isCertified && !isLearning) {
                        return false;
                    }

                    const shift = this.getShifts(dateStr, dateStr).find(s => s.userId === u.id);

                    // Strict: If user is on Leave, SKIP immediately
                    if (shift && shift.station === SYSTEM_OFF) return false;

                    if (shift) {
                        const existing = shift.specialRoles || [];
                        const station = shift.station || '';
                        
                        // 1. STATION CONFLICTS (崗位衝突)
                        // User Request: 開機/晚班不能是「場控」、「遠班」、「大直」 (and by extension logic, generally remote/admin roles usually avoid special roles)
                        if (station.includes('場控') || station.includes('遠') || station.includes('大直')) {
                            return false; // Cannot assign opening/late to these stations
                        }

                        // 2. SPECIAL ROLE CONFLICTS (特殊任務互斥衝突)
                        if (existing.length > 0) {
                            // Target: OPENING (開機)
                            if (role === SPECIAL_ROLES.OPENING) {
                                // 可以跟輔班 (ASSIST) 並存，但不能跟 晚班(LATE)、排班(SCHEDULER)
                                if (existing.includes(SPECIAL_ROLES.LATE) || existing.includes(SPECIAL_ROLES.SCHEDULER)) return false;
                            }
                            // Target: LATE (晚班)
                            else if (role === SPECIAL_ROLES.LATE) {
                                // 不能跟 開機(OPENING)、輔班(ASSIST)、排班(SCHEDULER)
                                if (existing.includes(SPECIAL_ROLES.OPENING) || existing.includes(SPECIAL_ROLES.ASSIST) || existing.includes(SPECIAL_ROLES.SCHEDULER)) return false;
                            }
                            // Target: ASSIST (輔班)
                            else if (role === SPECIAL_ROLES.ASSIST) {
                                // 可以跟開機並存，但不能跟晚班、排班
                                if (existing.includes(SPECIAL_ROLES.LATE) || existing.includes(SPECIAL_ROLES.SCHEDULER)) return false;
                            }
                            // Target: SCHEDULER (排班)
                            else if (role === SPECIAL_ROLES.SCHEDULER) {
                                // 排班不能跟開機、晚班、輔班
                                if (existing.includes(SPECIAL_ROLES.OPENING) || existing.includes(SPECIAL_ROLES.LATE) || existing.includes(SPECIAL_ROLES.ASSIST)) return false;
                            }
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

    // --- Data Archive & Cleanup ---

    async archiveData(beforeDate: string) {
        console.log(`[Store] Archiving data before ${beforeDate}...`);
        
        // Fetch Shifts
        const { data: shifts, error: shiftsError } = await this.fetchPaginated('shifts', q => q.lt('date', beforeDate));
        
        if (shiftsError) throw new Error('Failed to fetch shifts: ' + shiftsError.message);

        // Fetch Doctor Shifts
        const { data: doctorShifts, error: docShiftsError } = await this.fetchPaginated('doctor_shifts', q => q.lt('date', beforeDate));

        if (docShiftsError) throw new Error('Failed to fetch doctor shifts: ' + docShiftsError.message);

        // Fetch Leaves
        const { data: leaves, error: leavesError } = await this.fetchPaginated('leaves', q => q.lt('endDate', beforeDate));

        if (leavesError) throw new Error('Failed to fetch leaves: ' + leavesError.message);

        return {
            metadata: {
                archivedAt: new Date().toISOString(),
                criteria: { beforeDate },
                counts: {
                    shifts: shifts?.length || 0,
                    doctorShifts: doctorShifts?.length || 0,
                    leaves: leaves?.length || 0
                }
            },
            data: {
                shifts: shifts || [],
                doctorShifts: doctorShifts || [],
                leaves: leaves || []
            }
        };
    }

    async purgeOldData(beforeDate: string) {
        console.log(`[Store] PURGING data before ${beforeDate}...`);

        // 1. Shifts
        const { error: e1, count: c1 } = await supabase
            .from('shifts')
            .delete({ count: 'exact' })
            .lt('date', beforeDate);
        if (e1) throw new Error('Delete Shifts Error: ' + e1.message);

        // 2. Doctor Shifts
        const { error: e2, count: c2 } = await supabase
            .from('doctor_shifts')
            .delete({ count: 'exact' })
            .lt('date', beforeDate);
        if (e2) throw new Error('Delete Doctor Shifts Error: ' + e2.message);

        // 3. Leaves
        const { error: e3, count: c3 } = await supabase
            .from('leaves')
            .delete({ count: 'exact' })
            .lt('endDate', beforeDate);
        if (e3) throw new Error('Delete Leaves Error: ' + e3.message);

        console.log(`[Store] Purge Complete. Removed ${c1} shifts, ${c2} doc shifts, ${c3} leaves.`);
        
        // Refresh local state to ensure consistency
        await this.initializeData(true); 
        this.notifyListeners();

        return { shifts: c1 || 0, doctorShifts: c2 || 0, leaves: c3 || 0 };
    }

    async importData(jsonData: any) {
        console.log('[Store] Importing data...');
        const { data } = jsonData;
        if (!data || (!data.shifts && !data.doctorShifts && !data.leaves)) {
            throw new Error('Invalid backup file format.');
        }

        let importedCount = { shifts: 0, doctorShifts: 0, leaves: 0 };

        // 1. Import Shifts
        if (data.shifts && data.shifts.length > 0) {
            const { error } = await supabase.from('shifts').upsert(data.shifts);
            if (error) throw new Error('Import Shifts Error: ' + error.message);
            importedCount.shifts = data.shifts.length;
        }

        // 2. Import Doctor Shifts
        if (data.doctorShifts && data.doctorShifts.length > 0) {
            const { error } = await supabase.from('doctor_shifts').upsert(data.doctorShifts);
            if (error) throw new Error('Import Doctor Shifts Error: ' + error.message);
            importedCount.doctorShifts = data.doctorShifts.length;
        }

        // 3. Import Leaves
        if (data.leaves && data.leaves.length > 0) {
            const { error } = await supabase.from('leaves').upsert(data.leaves);
            if (error) throw new Error('Import Leaves Error: ' + error.message);
            importedCount.leaves = data.leaves.length;
        }

        await this.initializeData(true);
        this.notifyListeners();
        return importedCount;
    }

    // ── 影像雲班表 ────────────────────────────────────────
    getReportAssistants(): ReportAssistant[] {
        return [...this.reportAssistants];
    }

    async addReportAssistant(assistant: ReportAssistant) {
        this.reportAssistants = [...this.reportAssistants, assistant];
        this.notifyListeners();
        try {
            const { error } = await supabase.from('report_assistants').insert({
                id: assistant.id,
                name: assistant.name,
                color: assistant.color,
                is_active: assistant.isActive ?? true
            });
            if (error) throw error;
        } catch (e) { console.error('[Store] addReportAssistant failed', e); }
    }

    async updateReportAssistant(assistant: ReportAssistant) {
        this.reportAssistants = this.reportAssistants.map(a => a.id === assistant.id ? assistant : a);
        this.notifyListeners();
        try {
            const { error } = await supabase.from('report_assistants').update({
                name: assistant.name,
                color: assistant.color,
                is_active: assistant.isActive ?? true
            }).eq('id', assistant.id);
            if (error) throw error;
        } catch (e) { console.error('[Store] updateReportAssistant failed', e); }
    }

    async deleteReportAssistant(id: string) {
        this.reportAssistants = this.reportAssistants.filter(a => a.id !== id);
        this.notifyListeners();
        try {
            await supabase.from('report_assistants').delete().eq('id', id);
        } catch (e) { console.error('[Store] deleteReportAssistant failed', e); }
    }

    getCloudScheduleEntries(): CloudScheduleEntry[] {
        return [...this.cloudScheduleEntries];
    }

    private isImagingRelated(station?: string, task?: string): boolean {
        if (!station && !task) return false;
        const s = (station || '').toLowerCase();
        const t = (task || '').toLowerCase();
        // 影像相關站別與任務關鍵字
        const keywords = ['影像', '支援', '遠', 'ct', 'mr', 'us', '解說', 'bmd', 'remote'];
        return keywords.some(k => s.includes(k) || t.includes(k));
    }

    private shouldPreserveCloudSchedule(oldShift: DoctorShift | undefined, newShift: any): boolean {
        if (!oldShift) return true;
        
        // 1. 地點異動 -> 清除 (安全性考量，避免助理跨點指派錯誤)
        if (oldShift.location !== newShift.location) return false;

        // 2. 判斷新舊任務是否皆屬「影像/雲班表」範疇
        const wasImaging = this.isImagingRelated(oldShift.scheduled_station || oldShift.station, oldShift.task);
        const isImaging = this.isImagingRelated(newShift.scheduled_station || newShift.station || newShift.scheduled_station, newShift.task);

        // 如果原本是影像任務，且新任務也是影像任務，則保留
        if (wasImaging && isImaging) return true;

        // 3. 其餘情況 (例如改到休假、行政) 則維持清除
        return false;
    }

    getCloudScheduleEntry(date: string, doctorId: string): CloudScheduleEntry | undefined {
        return this.cloudScheduleEntries.find(e => e.date === date && e.doctorId === doctorId);
    }

    async upsertCloudScheduleEntry(entry: CloudScheduleEntry) {
        const exists = this.cloudScheduleEntries.find(e => e.date === entry.date && e.doctorId === entry.doctorId);
        if (exists) {
            this.cloudScheduleEntries = this.cloudScheduleEntries.map(e => (e.date === entry.date && e.doctorId === entry.doctorId) ? { ...e, ...entry } : e);
        } else {
            this.cloudScheduleEntries = [...this.cloudScheduleEntries, entry];
        }
        this.notifyListeners();
        try {
            const { data, error } = await supabase.from('cloud_schedule_entries').upsert({
                date: entry.date,
                doctor_id: entry.doctorId,
                assistant_ids: entry.assistantIds,
                proofreader_user_id: entry.proofreaderUserId ?? null
            }, { onConflict: 'date, doctor_id' }).select();
            
            if (error) {
                console.error('[Store] upsertCloudScheduleEntry Supabase Error:', error);
                throw error;
            }
            
            console.log('[Store] upsertCloudScheduleEntry Success:', data);
            
            // Update local ID if we got one back
            if (data && data[0]) {
                const saved = data[0];
                this.cloudScheduleEntries = this.cloudScheduleEntries.map(e => 
                    (e.date === saved.date && e.doctorId === saved.doctor_id) 
                    ? { ...e, id: saved.id } 
                    : e
                );
                this.notifyListeners();
            }
        } catch (e: any) { 
            console.error('[Store] upsertCloudScheduleEntry Catch Error:', e); 
            throw e; 
        }
    }

    // ── 影像雲班表輔助：醫師異動時自動清除助理與校對 ──────────

    /** 當醫師改班，將原本安排的助理和校對清除 */
    private async clearCloudScheduleHelpers(date: string, doctorId: string) {
        const existingEntry = this.cloudScheduleEntries.find(e => e.date === date && e.doctorId === doctorId);
        if (existingEntry) {
            const updatedEntry = { ...existingEntry, assistantIds: [], proofreaderUserId: undefined };
            
            // 更新本地
            this.cloudScheduleEntries = this.cloudScheduleEntries.map(e => 
                (e.date === date && e.doctorId === doctorId) ? updatedEntry : e
            );
            this.notifyListeners();

            // 若原本資料庫已有紀錄，直接更新為空
            if (existingEntry.id) {
                try {
                    await supabase.from('cloud_schedule_entries').update({
                        assistant_ids: [],
                        proofreader_user_id: null
                    }).eq('id', existingEntry.id);
                } catch (e) {
                    console.error('[Store] clearCloudScheduleHelpers fail:', e);
                }
            }
        }
    }

    /** 當醫師取消排班或變更為禁排，將影像雲班表完全刪除 */
    public async deleteCloudScheduleEntry(date: string, doctorId: string) {
        const existingEntry = this.cloudScheduleEntries.find(e => e.date === date && e.doctorId === doctorId);
        if (existingEntry) {
            this.cloudScheduleEntries = this.cloudScheduleEntries.filter(e => 
                !(e.date === date && e.doctorId === doctorId)
            );
            this.notifyListeners();
            
            if (existingEntry.id) {
                try {
                    await supabase.from('cloud_schedule_entries').delete().eq('id', existingEntry.id);
                } catch (e) {
                    console.error('[Store] deleteCloudScheduleEntry fail:', e);
                }
            }
        }
    }

    private async loadCloudScheduleData() {
        try {
            const [assistantsRes, entriesRes] = await Promise.all([
                supabase.from('report_assistants').select('*'), // 移除排序以防欄位錯誤
                this.fetchPaginated('cloud_schedule_entries')
            ]);
            
            console.log('[DEBUG] assistantsRes raw:', { 
                status: assistantsRes.status, 
                statusText: assistantsRes.statusText,
                data: assistantsRes.data,
                error: assistantsRes.error 
            });
            
            if (assistantsRes.error) console.error('[Store] report_assistants fetch error:', assistantsRes.error);
            if (entriesRes.error) console.error('[Store] cloud_schedule_entries fetch error:', entriesRes.error);
            if (assistantsRes.data) {
                console.log(`[Store] Loaded ${assistantsRes.data.length} assistants from DB.`);
                this.reportAssistants = assistantsRes.data.map((a: any) => ({
                    id: a.id,
                    name: a.name,
                    color: a.color,
                    isActive: a.is_active
                }));
            } else {
                console.warn('[Store] No assistant data returned from DB.');
            }
            if (entriesRes.data) {
                this.cloudScheduleEntries = entriesRes.data.map((e: any) => ({
                    id: e.id,
                    date: e.date,
                    doctorId: e.doctor_id,
                    assistantIds: e.assistant_ids || [],
                    proofreaderUserId: e.proofreader_user_id
                }));
                console.log(`[Store] Loaded ${this.cloudScheduleEntries.length} cloud schedule entries.`);
            }
        } catch (e) { console.warn('[Store] loadCloudScheduleData failed (tables may not exist yet)', e); }
    }

}

export const db = new Store();
