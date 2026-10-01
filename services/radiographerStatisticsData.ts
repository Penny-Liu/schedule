import type { User } from "../types";

type DateRange = { startDate: string; endDate: string };

/** Include every calendar month touched by the default and personal ranges. */
export const getRadiographerStatisticsMonths = (
  defaultRange: DateRange,
  monthKey: string | null,
  users: Pick<User, "personalCycles">[],
): string[] => {
  const ranges = [defaultRange];
  if (monthKey) {
    for (const user of users) {
      const personal = user.personalCycles?.[monthKey];
      if (personal) ranges.push(personal);
    }
  }
  const months = new Set<string>();
  for (const { startDate, endDate } of ranges) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "") || startDate > endDate) continue;
    let [year, month] = startDate.split("-").map(Number);
    const endMonth = endDate.slice(0, 7);
    while (`${year}-${String(month).padStart(2, "0")}` <= endMonth) {
      months.add(`${year}-${String(month).padStart(2, "0")}`);
      month++;
      if (month > 12) { year++; month = 1; }
    }
  }
  return [...months].sort();
};

export const loadRadiographerStatisticsMonths = async (
  months: string[],
  loadMonth: (year: number, month: number) => Promise<void>,
): Promise<void> => {
  // Serialize overlapping store windows; a failure must not expose partial totals.
  for (const monthKey of months) {
    const [year, month] = monthKey.split("-").map(Number);
    await loadMonth(year, month);
  }
};
