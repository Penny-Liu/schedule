import { describe, expect, it } from 'vitest';
import { User, UserRole } from '../types';
import { isLoginEligible } from './loginEligibility';

describe('login eligibility', () => {
    const admin = {
        role: UserRole.SYSTEM_ADMIN,
        isRadiographer: false,
        isPartTime: true,
        isActive: true,
        resignationDate: null,
        personalCycles: {},
    } as unknown as User;
    const today = '2026-10-15';

    it('includes an active non-radiographer part-time administrator', () => {
        expect(isLoginEligible(admin, today)).toBe(true);
    });
    it('keeps part-time staff excluded', () => {
        expect(isLoginEligible({ ...admin, role: UserRole.RADIOGRAPHER_STAFF }, today)).toBe(false);
    });
    it('keeps inactive and resigned administrators excluded', () => {
        expect(isLoginEligible({ ...admin, isActive: false }, today)).toBe(false);
        expect(isLoginEligible({ ...admin, resignationDate: '2026-10-14' }, today)).toBe(false);
    });
});
