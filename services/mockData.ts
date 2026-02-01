
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
    username: 'penny@example.com',
    role: UserRole.SCHEDULER,
    groupId: StaffGroup.GROUP_A,
    alias: '萍',
    color: '#EC4899', // Pink
    capabilities: ALL_SKILLS, // Supervisor usually can do most things
    primaryStation: '遠距', // Test: This user belongs to Remote team
    password: '12345',
    mustChangePassword: false
  },
  {
    id: 'user-admin',
    name: '系統管理員',
    username: 'admin@example.com',
    role: UserRole.SYSTEM_ADMIN,
    groupId: StaffGroup.GROUP_A,
    alias: '管',
    color: '#000000', // Black
    capabilities: ALL_SKILLS,
    primaryStation: 'REMOTE',
    password: 'admin',
    mustChangePassword: false
  },
  {
    id: 'user-002',
    name: '林小美',
    username: 'mei@example.com',
    role: UserRole.EMPLOYEE,
    groupId: StaffGroup.GROUP_B,
    alias: '美',
    color: '#8B5CF6', // Purple
    capabilities: ALL_SKILLS,
  },
  {
    id: 'user-003',
    name: '陳大明',
    username: 'ming@example.com',
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
    username: 'hua@example.com',
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
    username: 'hao@example.com',
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
    username: 'li@example.com',
    role: UserRole.VIEWER,
    groupId: StaffGroup.GROUP_A,
    alias: '強',
    color: '#EF4444', // Red 500
    capabilities: ALL_SKILLS,
    password: '8686',
    mustChangePassword: false
  },
  {
    id: 'user-007',
    name: '張美玲',
    username: 'zhang@example.com',
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
    username: 'chen@example.com',
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
    username: 'huang@example.com',
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
    username: 'lin@example.com',
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
    username: 'wu@example.com',
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
    username: 'tsai@example.com',
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
    username: 'yang@example.com',
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
    username: 'cheng@example.com',
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
    username: 'hsieh@example.com',
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



// Mock Doctors
export const MOCK_DOCTORS = [
    { id: 'doc-001', name: '陳醫師', alias: '陳', capabilities: ['影像', '遠班', '支援', '行政'], locations: ['北投', '大直'] },
    { id: 'doc-002', name: '林醫師', alias: '林', capabilities: ['影像', 'GI', '麻醉'], locations: ['北投'] },
    { id: 'doc-003', name: '黃醫師', alias: '黃', capabilities: ['影像', '遠班', '支援'], locations: ['北投', '台中'] },
    { id: 'doc-004', name: '張醫師', alias: '張', capabilities: ['影像', '行政', 'GI'], locations: ['大直'] },
    { id: 'doc-005', name: '李醫師', alias: '李', capabilities: ['影像', '遠班', '麻醉'], locations: ['北投', '大直', '台中'] },
    { id: 'doc-006', name: '王醫師', alias: '王', capabilities: ['影像', '支援'], locations: ['台中'] },
    { id: 'doc-007', name: '吳醫師', alias: '吳', capabilities: ['影像', '遠班', '支援', '行政'], locations: ['北投'] },
    { id: 'doc-008', name: '蔡醫師', alias: '蔡', capabilities: ['影像', 'GI'], locations: ['大直', '台中'] },
    { id: 'doc-009', name: '楊醫師', alias: '楊', capabilities: ['影像', '遠班', '麻醉'], locations: ['北投', '大直'] },
    { id: 'doc-010', name: '鄭醫師', alias: '鄭', capabilities: ['影像', '支援', '行政'], locations: ['大直'] }
];
