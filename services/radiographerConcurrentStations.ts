import { Shift, StationDefault } from "../types";

export const CONCURRENT_STATIONS = [
  StationDefault.MR3T, StationDefault.MR1_5T,
  StationDefault.CT, StationDefault.US1, StationDefault.US2,
  StationDefault.US3, StationDefault.US4, StationDefault.BMD_DX,
];
export const concurrentRole = (station: string) => `兼${station}`;
export const isConcurrentRole = (role: string) =>
  CONCURRENT_STATIONS.some((station) => concurrentRole(station) === role);
export const isExamStation = (station: string) => CONCURRENT_STATIONS.includes(station as StationDefault);
export const coversStation = (shift: Pick<Shift, "station" | "specialRoles">, station: string) =>
  shift.station === station || (isExamStation(shift.station) || /遠班|遠距/.test(shift.station)) &&
    isExamStation(station) && (shift.specialRoles || []).includes(concurrentRole(station));
export const normalizeConcurrentRoles = (station: string, roles: string[]) =>
  [...new Set(roles)].filter((role) => !isConcurrentRole(role) ||
    ((isExamStation(station) || /遠班|遠距/.test(station)) && role !== concurrentRole(station)));

// Capacity always comes from the original daily assignments, never station display rows.
export function uniqueDailyShifts(shifts: Shift[], date: string): Shift[] {
  return [...new Map(shifts.filter((shift) => shift.date === date)
    .map((shift) => [shift.userId, shift])).values()];
}
