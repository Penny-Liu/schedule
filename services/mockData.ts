
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

export const MOCK_USERS: User[] = [];
export const MOCK_LEAVES: LeaveRequest[] = [];
export const MOCK_SHIFTS: Shift[] = [];


