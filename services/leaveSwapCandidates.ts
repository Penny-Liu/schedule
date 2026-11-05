import { UserRole, type User } from "../types";
import { isUserOnEmploymentPause } from "./utils";

export const isEligibleLeaveSwapCandidate = (
  user: User,
  requesterId: string,
  dates: string[],
): boolean => user.id !== requesterId && user.isRadiographer === true &&
  user.role !== UserRole.RADIOGRAPHER_ASSISTANT &&
  user.isActive !== false && dates.every((date) =>
    (!user.hireDate || date >= user.hireDate) &&
    (!user.resignationDate || date <= user.resignationDate) &&
    !isUserOnEmploymentPause(user, date),
  );
