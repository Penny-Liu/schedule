import { SPECIAL_ROLES } from "../types";

export type FloorControlRoleDecision = "ALLOW" | "CONFIRM_SCHEDULER" | "BLOCK";

// 僅供手動編輯：例外只適用該筆班次的排班任務，不改變自動排班規則。
export const getFloorControlRoleDecision = (
  station: string,
  role: string,
  currentRoles: readonly string[],
  isSundayOrNationalHoliday: boolean,
): FloorControlRoleDecision => {
  if (!station.includes("場控") || role === "配合銷假" ||
      currentRoles.includes(role) || isSundayOrNationalHoliday) return "ALLOW";
  return role === SPECIAL_ROLES.SCHEDULER ? "CONFIRM_SCHEDULER" : "BLOCK";
};
