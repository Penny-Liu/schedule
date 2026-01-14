
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
    id: 'user-001',
    name: '劉雅萍',
    email: 'penny@example.com',
    role: UserRole.SUPERVISOR,
    groupId: StaffGroup.GROUP_A,
    alias: '萍',
    color: '#EC4899', // Pink
    capabilities: ALL_SKILLS, // Supervisor usually can do most things
    primaryStation: '遠距', // Test: This user belongs to Remote team
    password: '1234',
    mustChangePassword: true
  },
  {
    id: 'user-002',
    name: '林小美',
    email: 'mei@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_B,
    alias: '美',
    color: '#8B5CF6', // Purple
    capabilities: ALL_SKILLS,
  },
  {
    id: 'user-003',
    name: '陳大明',
    email: 'ming@example.com',
    role: UserRole.SUPERVISOR,
    groupId: StaffGroup.GROUP_A,
    alias: '明',
    color: '#3B82F6', // Blue
    capabilities: ALL_SKILLS,
    primaryStation: 'MRI',
    password: '1234',
    mustChangePassword: false
  },
  {
    id: 'user-004',
    name: '王小花',
    email: 'hua@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_B,
    alias: '花',
    color: '#10B981', // Emerald
    capabilities: ALL_SKILLS,
    primaryStation: 'CT',
    password: '1234',
    mustChangePassword: true
  },
  {
    id: 'user-005',
    name: '張志豪',
    email: 'hao@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_A,
    alias: '豪',
    color: '#F59E0B', // Amber
    capabilities: ALL_SKILLS,
    primaryStation: 'MRI',
    mustChangePassword: false
  },
  // --- 10 New Users ---
  {
    id: 'user-006',
    name: '李國強',
    email: 'li@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_A,
    alias: '強',
    color: '#EF4444', // Red 500
    capabilities: ALL_SKILLS,
    mustChangePassword: false
  },
  {
    id: 'user-007',
    name: '張美玲',
    email: 'zhang@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_B,
    alias: '玲',
    color: '#F97316', // Orange 500
    capabilities: ALL_SKILLS,
    mustChangePassword: false
  },
  {
    id: 'user-008',
    name: '陳志明',
    email: 'chen@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_A,
    alias: '志',
    color: '#84CC16', // Lime 500
    capabilities: ALL_SKILLS,
    mustChangePassword: false
  },
  {
    id: 'user-009',
    name: '黃秀英',
    email: 'huang@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_B,
    alias: '英',
    color: '#14B8A6', // Teal 500
    capabilities: ALL_SKILLS,
    mustChangePassword: false
  },
  {
    id: 'user-010',
    name: '林建宏',
    email: 'lin@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_A,
    alias: '宏',
    color: '#06B6D4', // Cyan 500
    capabilities: ALL_SKILLS,
    mustChangePassword: false
  },
  {
    id: 'user-011',
    name: '吳淑芬',
    email: 'wu@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_B,
    alias: '芬',
    color: '#3B82F6', // Blue 500
    capabilities: ALL_SKILLS,
    mustChangePassword: false
  },
  {
    id: 'user-012',
    name: '蔡明德',
    email: 'tsai@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_A,
    alias: '德',
    color: '#6366F1', // Indigo 500
    capabilities: ALL_SKILLS,
    mustChangePassword: false
  },
  {
    id: 'user-013',
    name: '楊雅雯',
    email: 'yang@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_B,
    alias: '雯',
    color: '#8B5CF6', // Violet 500
    capabilities: ALL_SKILLS,
    mustChangePassword: false
  },
  {
    id: 'user-014',
    name: '鄭志偉',
    email: 'cheng@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_A,
    alias: '偉',
    color: '#D946EF', // Fuchsia 500
    capabilities: ALL_SKILLS,
    mustChangePassword: false
  },
  {
    id: 'user-015',
    name: '謝欣怡',
    email: 'hsieh@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_B,
    alias: '怡',
    color: '#EC4899', // Pink 500
    capabilities: ALL_SKILLS,
    mustChangePassword: false
  }
];
export const MOCK_LEAVES: LeaveRequest[] = [];
export const MOCK_SHIFTS: Shift[] = [];


