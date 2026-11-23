import { expect, it } from 'vitest';
import { getDailyViewSyncRanges } from './dailyViewSync';

it('uses Taiwan today and fixed inclusive ranges for daily-view sync', () => {
  expect(getDailyViewSyncRanges(new Date('2026-11-22T16:30:00.000Z'))).toEqual({
    today: '2026-11-23',
    dailyStatsEnd: '2026-12-23',
    physicianWorkloadEnd: '2026-11-24',
  });
});
