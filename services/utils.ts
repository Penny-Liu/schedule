/**
 * Shared utility helpers used across multiple pages and services.
 */
import type { UserRole } from '../types';

/**
 * Converts a Date object to local ISO string (YYYY-MM-DD),
 * avoiding UTC offset issues from .toISOString().
 */
export const toLocalISOString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Counts non-Sunday days between refDate (inclusive) and targetDate (exclusive).
 * Uses mathematical formula instead of day-by-day loop — O(1).
 */
export const countNonSundayDays = (ref: Date, target: Date): number => {
  const totalDays = Math.floor(
    (target.getTime() - ref.getTime()) / 86_400_000
  );
  if (totalDays <= 0) return 0;

  const fullWeeks = Math.floor(totalDays / 7);
  const remainder = totalDays % 7;
  const refDay = ref.getDay(); // 0=Sun

  let remainNonSunday = 0;
  for (let i = 0; i < remainder; i++) {
    if ((refDay + i) % 7 !== 0) remainNonSunday++;
  }

  return fullWeeks * 6 + remainNonSunday;
};

/**
 * Helper function to generate UUID compatible with both secure and insecure contexts (e.g. non-HTTPS IP access)
 */
export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
  }
  // Fallback for non-secure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
  });
};

/**
 * Returns a localized Chinese label for a given UserRole.
 * Single source of truth — used by Sidebar, LoginPage, etc.
 */
export const getRoleLabel = (role: UserRole): string => {
  switch (role) {
    case 'SUPERVISOR' as UserRole: return '部門主管';
    case 'SYSTEM_ADMIN' as UserRole: return '系統管理員';
    case 'SCHEDULER' as UserRole: return '排班管理員';
    case 'PHYSICIAN_ADMIN' as UserRole: return '醫師排班管理';
    case 'VIEWER' as UserRole: return '瀏覽者';
    case 'FINANCE' as UserRole: return '財會';
    case 'HM_SUPERVISOR' as UserRole: return '健管主管';
    case 'HM_STAFF' as UserRole: return '健管同仁';
    case 'RADIOGRAPHER_STAFF' as UserRole: return '放射師';
    default: return '放射師';
  }
};

