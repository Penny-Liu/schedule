
import { User, UserRole, StaffGroup, Shift, LeaveRequest, LeaveStatus, LeaveType, StationDefault, SPECIAL_ROLES } from '../types';

const ALL_SKILLS = [
    StationDefault.MR1_5T, StationDefault.MR3T, 
    StationDefault.CT, 
    StationDefault.US1, StationDefault.US2, 
    StationDefault.BMD_DX,
    StationDefault.FLOOR_CONTROL,
    StationDefault.REMOTE,
    // Add common special roles to general full-stack skills
    SPECIAL_ROLES.OPENING,
    SPECIAL_ROLES.LATE
];

export const MOCK_USERS: User[] = [
  { 
    id: 'u1', name: '陳愛麗', alias: '麗', email: 'alice@med.com', role: UserRole.SUPERVISOR, groupId: StaffGroup.GROUP_A, color: '#F87171', 
    capabilities: [...ALL_SKILLS, SPECIAL_ROLES.SCHEDULER], // Supervisor gets Scheduler
    learningCapabilities: [] 
  }, 
  { 
    id: 'u2', name: '林志豪', alias: '豪', email: 'bob@med.com', role: UserRole.EMPLOYEE, groupId: StaffGroup.GROUP_A, color: '#60A5FA', 
    capabilities: [StationDefault.CT, StationDefault.BMD_DX, SPECIAL_ROLES.OPENING, SPECIAL_ROLES.LATE], 
    learningCapabilities: [StationDefault.MR1_5T] 
  }, 
  { 
    id: 'u3', name: '吳美玲', alias: '玲', email: 'charlie@med.com', role: UserRole.EMPLOYEE, groupId: StaffGroup.GROUP_B, color: '#34D399', 
    capabilities: [StationDefault.US1, StationDefault.US2, StationDefault.US3, SPECIAL_ROLES.OPENING, SPECIAL_ROLES.LATE], 
    learningCapabilities: [] 
  }, 
  { 
    id: 'u4', name: '王大衛', alias: '衛', email: 'david@med.com', role: UserRole.EMPLOYEE, groupId: StaffGroup.GROUP_B, color: '#FBBF24', 
    capabilities: [StationDefault.MR1_5T, StationDefault.MR3T, SPECIAL_ROLES.OPENING, SPECIAL_ROLES.LATE], 
    learningCapabilities: [StationDefault.CT] 
  }, 
  { 
    id: 'u5', name: '張怡君', alias: '君', email: 'eva@med.com', role: UserRole.EMPLOYEE, groupId: StaffGroup.GROUP_C, color: '#A78BFA', 
    capabilities: [StationDefault.CT, StationDefault.FLOOR_CONTROL, StationDefault.REMOTE, SPECIAL_ROLES.OPENING, SPECIAL_ROLES.LATE], 
    learningCapabilities: [] 
  }, 
  { 
    id: 'u6', name: '劉建國', alias: '國', email: 'frank@med.com', role: UserRole.EMPLOYEE, groupId: StaffGroup.GROUP_C, color: '#9CA3AF', 
    capabilities: [...ALL_SKILLS], // ALL_SKILLS now includes Opening/Late
    learningCapabilities: [] 
  }, 
  { 
    id: 'u7', name: '李雅婷', alias: '婷', email: 'grace@med.com', role: UserRole.EMPLOYEE, groupId: StaffGroup.GROUP_A, color: '#FB7185', 
    capabilities: [StationDefault.US1, StationDefault.BMD_DX, SPECIAL_ROLES.OPENING, SPECIAL_ROLES.LATE], 
    learningCapabilities: [] 
  }, 
  { 
    id: 'u8', name: '蔡家豪', alias: '蔡', email: 'henry@med.com', role: UserRole.EMPLOYEE, groupId: StaffGroup.GROUP_B, color: '#2DD4BF', 
    capabilities: [StationDefault.MR3T, SPECIAL_ROLES.OPENING, SPECIAL_ROLES.LATE], 
    learningCapabilities: [StationDefault.MR1_5T] 
  }, 
  { 
    id: 't1', name: '新進小王', alias: '新', email: 'new@med.com', role: UserRole.EMPLOYEE, groupId: StaffGroup.GROUP_A, color: '#A3E635', 
    capabilities: [StationDefault.BMD_DX, SPECIAL_ROLES.OPENING, SPECIAL_ROLES.LATE], 
    learningCapabilities: [StationDefault.CT, StationDefault.US1] 
  }, 
  { 
    id: 'admin', name: '系統管理員', alias: '管', email: 'admin@med.com', role: UserRole.SYSTEM_ADMIN, groupId: StaffGroup.GROUP_A, color: '#111827', 
    capabilities: [], 
    learningCapabilities: [] 
  }, 
];

export const MOCK_LEAVES: LeaveRequest[] = [
  {
    id: 'l1',
    userId: 'u2',
    startDate: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString().split('T')[0],
    endDate: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString().split('T')[0],
    type: LeaveType.PRE_SCHEDULED,
    status: LeaveStatus.PENDING,
    reason: '家庭聚會',
    createdAt: new Date().toISOString()
  }
];

export const MOCK_SHIFTS: Shift[] = [];
