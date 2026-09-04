import { countNonSundayDays } from "./utils";

export const GROUP_D_BALANCED_ROTATION_EFFECTIVE_DATE = "2026-11-03";

/**
 * Four-week Group D rotation across 24 non-Sunday days.
 *
 * Each block of six values represents one Monday-Saturday-equivalent week
 * relative to the cycle anchor. Across the full cycle, every index rests six
 * times and occupies each of the six eligible weekday positions exactly once.
 */
export const GROUP_D_BALANCED_ROTATION = [
  0, 1, 2, 3, 0, 1,
  3, 2, 0, 1, 3, 2,
  1, 0, 3, 2, 1, 0,
  2, 3, 1, 0, 2, 3,
] as const;

export const getGroupDRestIndex = (nonSundayCount: number): number => {
  if (!Number.isInteger(nonSundayCount) || nonSundayCount < 0) {
    throw new RangeError("nonSundayCount must be a non-negative integer");
  }
  return GROUP_D_BALANCED_ROTATION[
    nonSundayCount % GROUP_D_BALANCED_ROTATION.length
  ];
};

/**
 * Keeps the original modulo-four schedule before 2026-11-03. The balanced
 * cycle starts from day zero on the effective date so earlier schedules never
 * shift when the new table is introduced.
 */
export const getGroupDRestIndexForDate = (
  dateStr: string,
  legacyCycleStartDate: string,
): number => {
  const date = new Date(`${dateStr}T00:00:00`);

  if (dateStr < GROUP_D_BALANCED_ROTATION_EFFECTIVE_DATE) {
    const legacyStart = new Date(`${legacyCycleStartDate}T00:00:00`);
    return countNonSundayDays(legacyStart, date) % 4;
  }

  const balancedStart = new Date(
    `${GROUP_D_BALANCED_ROTATION_EFFECTIVE_DATE}T00:00:00`,
  );
  return getGroupDRestIndex(countNonSundayDays(balancedStart, date));
};
