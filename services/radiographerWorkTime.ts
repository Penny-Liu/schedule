import {
  DateEventType,
  Holiday,
  Shift,
  SPECIAL_ROLES,
  StationDefault,
} from "../types";

const WORK_TIME_BY_START: Record<string, string> = {
  "07:00": "07:00-15:00",
  "07:30": "07:30-15:30",
  "08:00": "08:00-16:00",
  "08:30": "08:30-16:30",
  "09:00": "09:00-17:00",
  "09:30": "09:30-17:30",
};

const hasRole = (shift: Shift, role: string) =>
  (shift.specialRoles || []).includes(role);

const includesAny = (value: string, fragments: string[]) =>
  fragments.some((fragment) => value.includes(fragment));

export type RadiographerWorkDayType =
  | "WEEKDAY"
  | "SATURDAY"
  | "SUNDAY_OR_HOLIDAY";

export const getRadiographerWorkDayType = (
  date: string,
  holidays: Holiday[],
): RadiographerWorkDayType => {
  const day = new Date(`${date}T00:00:00`).getDay();
  const isHoliday = holidays.some(
    (holiday) =>
      holiday.date === date &&
      (holiday.type === DateEventType.NATIONAL ||
        holiday.type === DateEventType.CLOSED),
  );

  if (day === 0 || isHoliday) return "SUNDAY_OR_HOLIDAY";
  if (day === 6) return "SATURDAY";
  return "WEEKDAY";
};

export const getAutomaticRadiographerWorkTime = (
  shift: Shift,
  shiftsForDate: Shift[],
  dayType: RadiographerWorkDayType,
  isRadiographerAssistant: boolean = false,
): string | null => {
  const station = shift.station || "";
  let startTime: keyof typeof WORK_TIME_BY_START | null = null;

  // Radiographer assistants always use their dedicated start time, regardless
  // of the station or special-duty rules used for radiographers.
  if (
    isRadiographerAssistant ||
    station.includes(StationDefault.ASSISTANT)
  ) {
    return dayType === "WEEKDAY"
      ? WORK_TIME_BY_START["09:30"]
      : WORK_TIME_BY_START["09:00"];
  }

  // Sundays and configured holidays use a unified 08:00 shift, except for
  // opening, assistant-control and MR1.5T duties that retain earlier starts.
  if (dayType === "SUNDAY_OR_HOLIDAY") {
    if (hasRole(shift, SPECIAL_ROLES.OPENING)) {
      return WORK_TIME_BY_START["07:00"];
    }
    if (
      hasRole(shift, SPECIAL_ROLES.ASSIST) ||
      station.includes(SPECIAL_ROLES.ASSIST)
    ) {
      return WORK_TIME_BY_START["07:30"];
    }
    if (station.includes(StationDefault.MR1_5T)) {
      return WORK_TIME_BY_START["07:30"];
    }
    return WORK_TIME_BY_START["08:00"];
  }

  // Special duties have priority over station-based defaults.
  if (hasRole(shift, SPECIAL_ROLES.OPENING)) {
    startTime = "07:00";
  } else if (
    hasRole(shift, SPECIAL_ROLES.ASSIST) ||
    station.includes(SPECIAL_ROLES.ASSIST)
  ) {
    startTime = "07:30";
  } else if (station.includes(StationDefault.FLOOR_CONTROL)) {
    startTime = dayType === "SATURDAY" ? "08:30" : "09:00";
  } else if (hasRole(shift, SPECIAL_ROLES.LATE)) {
    startTime = dayType === "SATURDAY" ? "08:30" : "09:00";
  } else if (station.includes(StationDefault.MR1_5T)) {
    startTime = "07:30";
  } else if (station.includes(StationDefault.MR3T)) {
    const mr15HasLateShift = shiftsForDate.some(
      (candidate) =>
        candidate.station?.includes(StationDefault.MR1_5T) &&
        hasRole(candidate, SPECIAL_ROLES.LATE),
    );
    startTime = mr15HasLateShift ? "07:30" : "08:00";
  } else if (
    hasRole(shift, SPECIAL_ROLES.SCHEDULER) ||
    station.includes(SPECIAL_ROLES.SCHEDULER)
  ) {
    startTime = "09:00";
  } else if (
    includesAny(station, [StationDefault.REMOTE, "遠班"])
  ) {
    startTime = "09:00";
  }

  if (!startTime) {
    return null;
  }

  return WORK_TIME_BY_START[startTime];
};
