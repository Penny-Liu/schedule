import type { Doctor, DoctorShift } from "../types";

export function getLateShiftCandidates(
  doctors: Doctor[],
  shifts: DoctorShift[],
  date: string,
  location: string,
) {
  return doctors.flatMap((doctor) => {
    if (
      doctor.isActive === false ||
      doctor.isPartTime ||
      /麻醉|麻醫/.test(doctor.specialty || "") ||
      doctor.capabilities?.some((name) => /麻醉|麻醫/.test(name))
    ) return [];
    const shift = shifts.find((s) => {
      const station = s.scheduled_station || s.station;
      return (
        s.doctorId === doctor.id &&
        s.date === date &&
        s.location === location &&
        !!station &&
        !/麻醉|麻醫/.test(station) &&
        !["X", "OFF", "休假", "Unassigned", "未分配"].includes(station)
      );
    });
    return shift ? [{ doctor, shift }] : [];
  });
}

export function hasLateShiftTask(shift: DoctorShift): boolean {
  return (shift.task || "").split(/[,，、]/).some((task) => task.trim() === "晚班");
}

export function removeLateShiftTask(shift: DoctorShift): DoctorShift {
  if (!hasLateShiftTask(shift)) return { ...shift };
  return {
    ...shift,
    task: (shift.task || "")
      .split(/[,，、]/)
      .map((task) => task.trim())
      .filter((task) => task && task !== "晚班")
      .join(", "),
  };
}

export function addLateShiftTask(shift: DoctorShift): DoctorShift {
  return {
    ...shift,
    task: hasLateShiftTask(shift)
      ? shift.task
      : shift.task
        ? `${shift.task}, 晚班`
        : "晚班",
  };
}
