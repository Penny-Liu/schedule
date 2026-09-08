import type {
  DailyManpowerStats,
  HealthMgmtShift,
  HealthMgmtStaff,
} from "../types";

const displayCount = (value: number | undefined): string => {
  const count = Math.max(0, Math.round(Number(value) || 0));
  return count > 0 ? String(count) : "";
};

export const formatPhysicianDazhiLineStats = (
  stats?: DailyManpowerStats,
): string =>
  [
    `健檢/代謝總人數：${displayCount(stats?.dazhi_clients)} 位/${displayCount(stats?.dazhi_metabolism_clients)} 位`,
    "健檢/代謝解說： 位/ 位",
    `營養諮詢：${displayCount(stats?.dazhi_nutrition_consultations)}位`,
    `腸胃：${displayCount(stats?.dazhi_gi)}`,
    `心超：${displayCount(stats?.dazhi_ultrasound_heart)}`,
  ].join("\n");

const getShiftTokens = (shift: HealthMgmtShift): string[] => {
  const unpackedTask = String(shift.task || "").split("@@")[0];
  return `${unpackedTask},${shift.station || ""}`
    .normalize("NFKC")
    .split(/[,、，]/)
    .map((token) => token.trim())
    .filter(Boolean);
};

export const formatPhysicianDazhiLineStaffBlock = (
  date: string,
  shifts: HealthMgmtShift[],
  staff: HealthMgmtStaff[],
): string => {
  const [, month = "", day = ""] = date.split("-");
  const dateLabel = `${Number(month) || month}/${Number(day) || day}`;
  const staffById = new Map(staff.map((person) => [person.id, person]));
  const getAssignments = (
    target: string,
    annotateSecondaryControl = false,
  ): string => {
    const assignments = shifts
      .filter((shift) => {
        const person = staffById.get(shift.userId);
        const packedLocation = String(shift.task || "").split("@@")[1];
        const location = shift.location || packedLocation || person?.location;
        return (
          location === "大直" && getShiftTokens(shift).includes(target)
        );
      })
      .map((shift) => {
        const name = staffById.get(shift.userId)?.name || "";
        if (!name) return "";
        return annotateSecondaryControl &&
          getShiftTokens(shift).includes("輔控")
          ? `${name}(輔控)`
          : name;
      })
      .filter(Boolean);

    return [...new Set(assignments)].join("、");
  };

  return [
    `(${dateLabel}) 點位分配`,
    `問診：${getAssignments("問診")}`,
    `抽１：${getAssignments("抽1", true)}`,
    `抽２：${getAssignments("抽2")}(若抽血有空，協助問診第一順位)`,
    `基礎A (眼科＋鼻咽鏡)：${getAssignments("基礎A")}(若基礎有空，協助問診第二順位)`,
    `基礎Ｂ(聽肺、ABI、HRV)：${getAssignments("基礎B")}`,
    `主控：${getAssignments("主控")}`,
    `排班：${getAssignments("排班")}`,
  ].join("\n");
};
