import type { Shift, User } from "../types";
import { StationDefault } from "../types";

const getLearningCategory = (value: string): string => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized.startsWith("MR")) return "MR";
  if (normalized.startsWith("CT")) return "CT";
  if (
    normalized.startsWith("US") ||
    normalized.includes("超音波") ||
    normalized.includes("心超")
  ) {
    return "US";
  }
  if (normalized.includes("BMD")) return "BMD";
  if (normalized.includes("DX")) return "DX";
  if (normalized.includes("MG")) return "MG";
  return normalized;
};

export const matchesLearningCategory = (
  capabilityOrStation: string,
  learningStation: string,
): boolean =>
  getLearningCategory(capabilityOrStation) ===
  getLearningCategory(learningStation);

const isActiveLearningCapability = (
  user: User,
  capability: string,
  date: string,
): boolean => {
  if (!user.learningCapabilities?.includes(capability)) return false;
  const endDate = user.learningSchedules?.[capability];
  return !endDate || date <= endDate;
};

export const canTeachLearningCategory = (
  user: User,
  learningStation: string,
  date: string,
): boolean => {
  const isStillLearning = (user.learningCapabilities || []).some(
    (capability) =>
      matchesLearningCategory(capability, learningStation) &&
      isActiveLearningCapability(user, capability, date),
  );
  if (isStillLearning) return false;

  return (user.capabilities || []).some(
    (capability) =>
      Boolean(capability) &&
      matchesLearningCategory(capability, learningStation),
  );
};

export const getLearningTeacherCandidates = (
  users: User[],
  shifts: Shift[],
  studentUserId: string,
  date: string,
  learningStation: string,
): Array<{ user: User; shift: Shift }> => {
  const shiftsByUser = new Map(
    shifts
      .filter(
        (shift) =>
          shift.date === date &&
          shift.userId !== studentUserId &&
          shift.station !== StationDefault.OFF &&
          shift.station !== StationDefault.UNASSIGNED &&
          shift.station !== "休假",
      )
      .map((shift) => [shift.userId, shift]),
  );

  return users
    .filter(
      (user) =>
        user.id !== studentUserId &&
        user.isActive !== false &&
        user.isRadiographer !== false &&
        shiftsByUser.has(user.id) &&
        canTeachLearningCategory(user, learningStation, date),
    )
    .map((user) => ({ user, shift: shiftsByUser.get(user.id)! }))
    .sort((a, b) => {
      const aSameCategory = matchesLearningCategory(
        a.shift.station,
        learningStation,
      );
      const bSameCategory = matchesLearningCategory(
        b.shift.station,
        learningStation,
      );
      if (aSameCategory !== bSameCategory) return aSameCategory ? -1 : 1;
      return a.user.name.localeCompare(b.user.name, "zh-Hant");
    });
};
