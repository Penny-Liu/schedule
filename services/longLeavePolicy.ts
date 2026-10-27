import type { RosterCycle } from "../types";

type CycleDates = Pick<RosterCycle, "startDate" | "endDate">;

const taipeiDate = (now: Date): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const nextDate = (date: string): string => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

// 依共同排班週期實際起訖日，鎖定目前週期及後兩個週期。
export const getLongLeaveApplicationMinDate = (
  cycles: readonly CycleDates[],
  now = new Date(),
): string | null => {
  const today = taipeiDate(now);
  const sorted = [...cycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const current = sorted.filter((cycle) => cycle.startDate <= today && today <= cycle.endDate);
  if (current.length !== 1) return null;
  const index = sorted.indexOf(current[0]);
  const locked = sorted.slice(index, index + 3);
  if (locked.length !== 3) return null;
  for (let i = 0; i < locked.length; i++) {
    const cycle = locked[i];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cycle.startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(cycle.endDate) ||
        cycle.startDate > cycle.endDate) return null;
    if (i > 0 && cycle.startDate !== nextDate(locked[i - 1].endDate)) return null;
  }
  return nextDate(locked[2].endDate);
};

export const getLongLeaveApplicationError = (
  startDate: string,
  cycles: readonly CycleDates[],
  now = new Date(),
): string | null => {
  const minimum = getLongLeaveApplicationMinDate(cycles, now);
  if (!minimum) return "目前週期或後兩個週期尚未完整設定，請先由管理者確認排班週期，才能申請長假。既有申請仍可審核。";
  if (!startDate || startDate >= minimum) return null;
  return `為提前兩個週期排班，目前週期及後兩個週期的長假已截止申請，最早可申請 ${minimum} 起的長假。既有申請仍可審核。`;
};

export const isLongLeaveBeyondReviewWindow = (
  startDate: string,
  cycles: readonly CycleDates[],
  now = new Date(),
): boolean => {
  const minimum = getLongLeaveApplicationMinDate(cycles, now);
  return Boolean(minimum && startDate && startDate >= minimum);
};
