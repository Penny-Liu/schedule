import type { Doctor, DoctorShift } from "../types";

export function getLateShiftCandidates(
  doctors: Doctor[],
  shifts: DoctorShift[],
  date: string,
  location: string,
) {
  return doctors.flatMap((doctor) => {
    if (doctor.isActive === false) return [];
    const shift = shifts.find((s) => {
      const station = s.scheduled_station || s.station;
      return (
        s.doctorId === doctor.id &&
        s.date === date &&
        s.location === location &&
        !!station &&
        !["X", "OFF", "休假", "Unassigned", "未分配"].includes(station)
      );
    });
    return shift ? [{ doctor, shift }] : [];
  });
}

export function addLateShiftTask(shift: DoctorShift): DoctorShift {
  return {
    ...shift,
    task: shift.task?.includes("晚班")
      ? shift.task
      : shift.task
        ? `${shift.task}, 晚班`
        : "晚班",
  };
}
