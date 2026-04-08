
export enum UserRole {
  SUPERVISOR = 'SUPERVISOR', // 放射師主管
  RADIOGRAPHER_STAFF = 'RADIOGRAPHER_STAFF', // 放射師同仁
  SYSTEM_ADMIN = 'SYSTEM_ADMIN', // 系統管理員
  PHYSICIAN_ADMIN = 'PHYSICIAN_ADMIN', // 醫師/行政管理
  HM_SUPERVISOR = 'HM_SUPERVISOR', // 健管主管
  HM_STAFF = 'HM_STAFF', // 健管同仁
  VIEWER = 'VIEWER', // 瀏覽者 (僅查看)
  FINANCE = 'FINANCE', // 財會 (僅查看醫師排班/工作統計/個人設定)
  SCHEDULER = 'SCHEDULER', // Legacy: 舊版管理員
}

export enum StaffGroup {
  GROUP_A = 'A',
  GROUP_B = 'B',
  GROUP_C = 'C',
  GROUP_D = 'D'  // Rolling rotation: Sun always off, Mon-Sat rotate by index
}

// ── 權限常量 ──────────────────────────
export const PERMISSIONS = {
  VIEW_CLOUD_SCHEDULE: 'view_cloud_schedule',
  EDIT_CLOUD_SCHEDULE: 'edit_cloud_schedule',
  VIEW_STAFF: 'staff_view',
  EDIT_STAFF: 'staff_edit',
  VIEW_PHYSICIAN: 'physician_view',
  EDIT_PHYSICIAN: 'physician_edit',
  VIEW_STATS: 'stats_view',
  VIEW_DOCTOR_STATS: 'doctor_stats_view',
  EDIT_DOCTOR_STATS: 'doctor_stats_edit',
  MANAGE_DOCTORS: 'doctors_manage',
  EDIT_SETTINGS: 'settings_edit',
  VIEW_HEALTH_MGMT: 'health_mgmt_view',
  EDIT_HEALTH_MGMT: 'health_mgmt_edit',
  VIEW_ANESTHESIA: 'anesthesia_view',
  EDIT_ANESTHESIA: 'anesthesia_edit',
};

export const PERMISSION_LABELS: Record<string, string> = {
  [PERMISSIONS.VIEW_CLOUD_SCHEDULE]: '查看雲班表',
  [PERMISSIONS.EDIT_CLOUD_SCHEDULE]: '編輯雲班表',
  [PERMISSIONS.VIEW_STAFF]: '查看人員管理',
  [PERMISSIONS.EDIT_STAFF]: '編輯人員管理',
  [PERMISSIONS.VIEW_PHYSICIAN]: '查看醫師排班',
  [PERMISSIONS.EDIT_PHYSICIAN]: '編輯醫師排班',
  [PERMISSIONS.VIEW_STATS]: '查看工作統計',
  [PERMISSIONS.VIEW_DOCTOR_STATS]: '查看醫師統計',
  [PERMISSIONS.EDIT_DOCTOR_STATS]: '編輯醫師統計',
  [PERMISSIONS.MANAGE_DOCTORS]: '管理醫師名單',
  [PERMISSIONS.EDIT_SETTINGS]: '系統設定權限',
  [PERMISSIONS.VIEW_HEALTH_MGMT]: '查看健管排班',
  [PERMISSIONS.EDIT_HEALTH_MGMT]: '編輯健管排班',
  [PERMISSIONS.VIEW_ANESTHESIA]: '查看麻護排班',
  [PERMISSIONS.EDIT_ANESTHESIA]: '編輯麻護排班',
};

export type HMDesignation = '健管師' | '行政人員' | '營養師' | '醫檢師' | '藥師';

export interface HealthMgmtStaff {
    id: string;
    name: string;
    alias?: string;
    isActive: boolean;
    role?: 'ADMIN' | 'VIEWER';
    location?: string;
    displayOrder?: number;
    designation?: HMDesignation;
}

export interface AnesthesiaStaff {
    id: string;
    name: string;
    alias?: string;
    isActive: boolean;
    locations?: string[];
    role?: 'ADMIN' | 'VIEWER';
    displayOrder?: number;
}

export interface User {
  id: string;
  name: string;
  username: string; // New: Replaces email for login
  role: UserRole;
  groupId: StaffGroup;
  color?: string; // Specific color for the user avatar
  alias?: string; // New: Single character nickname/code displayed in avatar
  avatarUrl?: string; // Kept for backward compatibility
  capabilities?: string[]; // List of station names user is CERTIFIED in
  learningCapabilities?: string[]; // New: List of station names user is LEARNING
  excludedCapabilities?: string[]; // New: List of station names user is CERTIFIED but EXCLUDED from auto-schedule
  password?: string; // User defined password
  mustChangePassword?: boolean; // New: Force password change on next login
  primaryStation?: string; // New: Identifies the user's "Home" station (e.g., '遠距')
  isActive?: boolean; // New: Soft delete flag (true = active, false = resigned)
  resignationDate?: string; // New: Date of resignation YYYY-MM-DD
  isRadiographer?: boolean; // New: Flag to indicate if user should appear in Radiographer Schedule
  isPartTime?: boolean; // New: Flag for part-time radiographers (hidden in main view)
  isHealthMgmt?: boolean; // New: Flag for health management staff
  healthMgmtLocation?: '全部' | '北投' | '大直'; // New: Restricts HM_SUPERVISOR/HM_STAFF view and edit location. '全部' allows dropdown.
  groupIndex?: number; // New: Fixed rotation index for Group D (0-based, determines rest day order)
  personalCycles?: Record<string, { startDate: string; endDate: string; memo: string }>; // Per-month cycle adjustments
  permissions?: string[]; // Fine-grained permissions
}

// ── 影像雲班表 ──────────────────────────
export interface ReportAssistant {
  id: string;
  name: string;
  color?: string;
  isActive?: boolean;
}

export interface CloudScheduleEntry {
  id?: string;
  date: string;            // YYYY-MM-DD
  doctorId: string;        // ID of the radiologist (影像醫學部醫師)
  assistantIds: string[];  // IDs of ReportAssistants on duty
  proofreaderUserId?: string; // isRadiographer User.id
}


// Updated Station Defaults: MR moved before US
export enum StationDefault {
  MR1_5T = 'MR1.5T',
  MR3T = 'MR3T',
  US1 = 'US1',
  US2 = 'US2',
  US3 = 'US3',
  US4 = 'US4',
  CT = 'CT',
  BMD_DX = 'BMD/DX',
  FLOOR_CONTROL = '場控',
  TECH_SUPPORT = '技術支援',
  REMOTE = '遠距',
  ADMIN = '行政',
  DAZHI_BRANCH = '大直',
  OFF = '休假',
  UNASSIGNED = '未分配'
}

export const SYSTEM_OFF = '休假';

export const SPECIAL_ROLES = {
  OPENING: '開機',
  LATE: '晚班',
  ASSIST: '輔班', // User called it "輔控", mapping to Assist/Support
  SCHEDULER: '排班',
  DAZHI_SUPPORT: '大直支援', // New: Remote staff supporting Dazhi
  DUAL_BMD: '兼BMD/DX'
};

export interface Shift {
  id: string;
  userId: string;
  date: string; // ISO Date string YYYY-MM-DD
  station: string;
  location?: string; // New: Work location (北投/大直)
  specialRoles: string[];
  isAutoGenerated?: boolean;
  isRoleAutoGenerated?: boolean;
}

export interface HealthMgmtShift {
    id: string;
    userId: string;
    date: string;
    station: string;
    task?: string; 
    time?: string; // New: Working hours (e.g. "07:30-15:30")
    location?: string; 
    specialRoles?: string[];
}

export interface AnesthesiaShift {
    id: string;
    userId: string;
    date: string;
    station: string;
    task?: string; 
    location?: string;
    workTime?: string;
    note?: string;
}

export enum LeaveType {
  PRE_SCHEDULED = '預假',
  CANCEL_LEAVE = '銷假',
  LONG_LEAVE = '長假',
  SWAP_SHIFT = '換假', // 雙向換假 (User A Work D1/Off D2 <-> User B Off D1/Work D2)
  ASK_LEAVE = '要假',  // 單向要假 (User A Work D1 -> User B Off D1)
  DUTY_SWAP = '任務換班' // 特殊任務換班 (開機/晚班)
}

export enum LeaveStatus {
  PENDING = '待審核',
  APPROVED = '已核准',
  REJECTED = '已駁回'
}

export interface LeaveRequest {
  id: string;
  userId: string;
  targetUserId?: string; // For Swap Shift
  startDate: string;
  endDate: string;
  returnDate?: string; // For Two-Way Swap Shift
  type: LeaveType;
  status: LeaveStatus;
  reason: string;
  createdAt: string;
  approverId?: string; // Who approved/rejected it
  processedAt?: string; // When it was processed

  // New fields for Duty Swap specificity & 2-step approval
  roleToSwap?: string; // E.g., '開機' or '晚班'
  targetApproval?: 'PENDING' | 'AGREED' | 'REJECTED'; // Status of the target user's agreement
}

export interface RosterCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isConfirmed?: boolean; // New: Lock status for the cycle
  location?: string; // New: Beitou or Dazhi for Health Mgmt Cycles
  staffOrder?: string[];
}

export enum DateEventType {
  NATIONAL = 'NATIONAL', // 國定假日
  MEETING = 'MEETING',   // 科會
  CLOSED = 'CLOSED',     // 休診 (全員預設休假)
  NOTE = 'NOTE',          // 備忘
  RADIOGRAPHER_NOTE = 'RADIOGRAPHER_NOTE', // 放射師備忘 (僅顯示於放射師排班)
  DOCTOR_NOTE = 'DOCTOR_NOTE' // 醫師備忘 (僅顯示於醫師排班)
}

export interface Holiday {
  id?: string; // Unique identifier
  date: string; // YYYY-MM-DD
  name: string;
  type: DateEventType;
}

export interface CycleAnchor {
  effectiveDate: string; // The date from which this logic applies (>=)
  anchorDate: string;    // The reference "Day 1" for calculation
}

export interface DailyManpowerStats {
  beitou_clients: number;
  beitou_cta: number;
  dazhi_clients: number;
  dazhi_metabolism_clients?: number; // New: Metabolism clients count for Dazhi
  beitou_gi?: number; // New: Manual GI cases count
  beitou_mr?: number; // New: Manual MR cases count
  dazhi_gi?: number;  // New: Manual GI cases count for Dazhi
  beitou_total?: number; // Manually entered total radiographer count for Beitou
  dazhi_max_capacity?: number; // New: Manually entered max capacity for Dazhi (最大量)
  beitou_max_capacity?: number; // New: Manually entered max capacity for Beitou (最大量)
  dazhi_metabolism_max_capacity?: number; // New: Manually entered max capacity for Dazhi metabolism
}

export interface WeekdaySetting {
    dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    workTime?: string; // e.g., "08:00-16:00"
    task?: string;     // e.g., "亞東看診" (was memo)
}

export interface Doctor {
    id: string;
    name: string;
    alias?: string; // Short name for display (e.g., '錢')
    specialty?: string; // New: e.g. "家醫科"
    capabilities?: string[]; // New: List of stations/skills this doctor can perform
    locations?: string[]; // New: List of locations (Beitou, Dazhi, Taichung)
    excludedDays?: number[]; // New: 0 (Sun) - 6 (Sat)
    excludedAutoScheduleLocations?: string[]; // New: Locations to exclude from auto-schedule
    isPartTime?: boolean; // New: Part-time doctor tag
    monthlyTargetShifts?: number; // New: Target number of shifts per month
    displayOrder?: number; // New: Custom display order (lower number = higher priority)
    isActive?: boolean; // New: For soft delete
    fixedShifts?: FixedShift[]; // New: Fixed weekly shifts
    weekdaySettings?: WeekdaySetting[]; // New: Weekday-specific work hours and memos
    personalCycles?: Record<string, { startDate: string; endDate: string; memo: string; }>; // New: Monthly work cycles (e.g., '2026-03': {...})
}

export interface FixedShift {
    dayOfWeek: number; // 0=Sun, 1=Mon...
    station: string;
    location: string;
    workTime?: string;
}

export interface DoctorShift {
    id: string;
    doctorId: string;
    date: string; // YYYY-MM-DD
    station: string;
    explanationTaskType?: 'with_task' | 'standalone'; // Type of explanation task: 'with_task' (+解说) or 'standalone' ((解说))
    workTime?: string; // New: Working hours (e.g. "08:00-12:00")
    location?: string; // New: Beitou, Dazhi, Taichung
    task?: string; // New: Additional task (e.g. Late shift), displayed with note
    note?: string; // New: Special notes
    isAutoGenerated?: boolean; // New: Flag for auto-scheduled items
    scheduled_station?: string; // New: Actual schedule (CT, MR, US) vs Allocation (station)
}

export interface DoctorStationConfig {
  name: string;
  location: string; // '北投' | '大直' | '台中'
}

export interface SystemSettings {
  stations: string[];
  cycles: RosterCycle[];
  holidays: Holiday[]; // Renamed internally as special dates/holidays
  // Map of Station Name -> Array of 7 numbers [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  stationRequirements: Record<string, number[]>;
  cycleStartDate?: string; // Legacy: Global fallback
  cycleAnchors?: CycleAnchor[]; // New: Multiple reset points
  stationDisplayOrder?: string[]; // New: Order of stations/roles in dashboard
  userDisplayOrder?: string[]; // New: Order of user IDs in dashboard
  dailyStats?: Record<string, DailyManpowerStats>; // New: Date (YYYY-MM-DD) -> Stats
  doctorStations?: DoctorStationConfig[]; // New: Configurable doctor stations with location
  doctorSpecialties?: string[]; // New: Configurable doctor specialties
  lineCopyTemplate?: string; // Custom template for 'Copy to Line'
  defaultDoctorWorkTime?: string; // Default work time for auto-schedule
  doctorWorkTimeOptions?: string[]; // New: List of available work times
  lockedMonths?: string[]; // New: List of locked months (YYYY-MM)
  healthMgmtStations?: string[]; // New: List of health management stations
  healthMgmtTasks?: string[]; // New: List of health management tasks
  healthMgmtTimes?: string[]; // Global fallback
  healthMgmtStationsByLocation?: Record<string, string[]>; // New: Location-based stations
  healthMgmtTasksByLocation?: Record<string, string[]>; // New: Location-based tasks
  healthMgmtTimesByLocation?: Record<string, string[]>; // New: Location-based times
  healthMgmtCycles?: RosterCycle[]; // New: Independent cycles for HM
}
