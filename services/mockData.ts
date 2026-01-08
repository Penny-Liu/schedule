
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
    capabilities: [StationDefault.MR1_5T, StationDefault.CT, StationDefault.US1],
  }
];
export const MOCK_LEAVES: LeaveRequest[] = [];
export const MOCK_SHIFTS: Shift[] = [];


