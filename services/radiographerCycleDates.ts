import type { RosterCycle } from "../types";

export const getRadiographerCycleMonthKey = (cycle: RosterCycle): string => {
  const match = cycle.name.trim().match(/^(\d{4})\/(\d{1,2})$/);
  return match
    ? `${match[1]}-${match[2].padStart(2, "0")}`
    : cycle.startDate.slice(0, 7);
};

export const getRadiographerDefaultDatesForMonth = (
  yearMonth: string,
  cycles: RosterCycle[],
): { startDate: string; endDate: string } => {
  const [year, month] = yearMonth.split("-").map(Number);
  const monthStart = `${yearMonth}-01`;
  const monthEnd = `${yearMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

  // A numbered cycle can start in the preceding month. Match its name first,
  // before the legacy date fallback, so two January starts cannot swap cycles.
  const namedCycle = cycles.find(
    (cycle) => /^\d{4}\/\d{1,2}$/.test(cycle.name.trim()) &&
      getRadiographerCycleMonthKey(cycle) === yearMonth,
  );
  const cycle = namedCycle
    ?? cycles.find((candidate) => candidate.startDate.startsWith(yearMonth))
    ?? cycles.find((candidate) => candidate.startDate <= monthEnd && candidate.endDate >= monthStart);

  return cycle
    ? { startDate: cycle.startDate, endDate: cycle.endDate }
    : { startDate: monthStart, endDate: monthEnd };
};
