import type {
  DailyManpowerStats,
  HealthMgmtShift,
  HealthMgmtStaff,
} from "../types";

const displayCount = (value: number | undefined): string => {
  if (value == null) return "";
  const count = Math.max(0, Math.round(Number(value) || 0));
  return String(count);
};

export const formatPhysicianDazhiLineStats = (
  stats?: DailyManpowerStats,
): string =>
  [
    `健檢/代謝總人數：${displayCount(stats?.dazhi_clients)} 位/${displayCount(stats?.dazhi_metabolism_clients)} 位`,
    `健檢/代謝解說：${displayCount(stats?.dazhi_health_explanations)} 位/${displayCount(stats?.dazhi_metabolism_explanations)} 位`,
    `營養諮詢：${displayCount(stats?.dazhi_nutrition_consultations)}位`,
    `腸胃：${displayCount(stats?.dazhi_gi)}`,
    `心超：${displayCount(stats?.dazhi_ultrasound_heart)}`,
  ].join("\n");

export const formatPhysicianBeitouLineStats = (
  stats?: DailyManpowerStats,
): string =>
  [
    `總人數 : ${displayCount(stats?.beitou_clients)}人`,
    `解說：${displayCount(stats?.beitou_health_explanations)}人`,
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
  const [year = "", month = "", day = ""] = date.split("-");
  const dateLabel = `${Number(month) || month}/${Number(day) || day}`;
  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
  const weekday = dayNames[
    new Date(Number(year), Number(month) - 1, Number(day)).getDay()
  ];
  const staffById = new Map(staff.map((person) => [person.id, person]));
  const getAssignments = (...targets: string[]): string => {
    const assignments = shifts
      .filter((shift) => {
        const person = staffById.get(shift.userId);
        const packedLocation = String(shift.task || "").split("@@")[1];
        const location = shift.location || packedLocation || person?.location;
        return (
          location === "大直" &&
          getShiftTokens(shift).some((token) => targets.includes(token))
        );
      })
      .map((shift) => staffById.get(shift.userId)?.name || "")
      .filter(Boolean);

    return [...new Set(assignments)].join("、");
  };

  return [
    `${dateLabel} （${weekday}） 點位分配`,
    `問１：${getAssignments("問診", "問1")}`,
    `問２/前流動：${getAssignments("問2", "前流動", "問2/前流動")}`,
    `抽１：${getAssignments("抽1")}`,
    `抽２：${getAssignments("抽2")}`,
    `基礎A ：${getAssignments("基礎A")}`,
    `基礎Ｂ：${getAssignments("基礎B")}`,
    `輔控/後流動：${getAssignments("輔控", "後流動", "輔控/後流動")}`,
    `主控：${getAssignments("主控")}`,
    `排班：${getAssignments("排班")}`,
  ].join("\n");
};
