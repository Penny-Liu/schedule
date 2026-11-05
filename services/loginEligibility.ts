import { User, UserRole } from '../types';
import { isUserOnEmploymentPause } from './utils';

export function isLoginEligible(user: User, today: string): boolean {
    if (isUserOnEmploymentPause(user, today)) return false;
    // Part-time employment must not hide an otherwise active administrator.
    if (user.isPartTime === true && user.role !== UserRole.SYSTEM_ADMIN) return false;
    if (user.resignationDate) return user.resignationDate >= today;
    return user.isActive !== false;
}
