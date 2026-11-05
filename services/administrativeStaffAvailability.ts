import { AdministrativeCategory } from "../types";

interface StaffAvailability {
  name: string;
  category: AdministrativeCategory;
  scheduling_paused?: boolean;
}
interface Assignment {
  category: AdministrativeCategory;
  date: string;
  location: string;
  staffNames: string;
}
export const isGeneCategory = (category: AdministrativeCategory): boolean =>
  category === AdministrativeCategory.GENE || category === AdministrativeCategory.GENE_H;

export const isStaffSchedulingPaused = (staff: StaffAvailability): boolean =>
  isGeneCategory(staff.category) && staff.scheduling_paused === true;

export const getAvailableAdministrativeNames = (
  category: AdministrativeCategory,
  historicalNames: string[],
  staff: StaffAvailability[],
): string[] => {
  const paused = new Set(staff.filter((person) => person.category === category && isStaffSchedulingPaused(person)).map((person) => person.name.trim()));
  return [...new Set([...historicalNames, ...staff.filter((person) => person.category === category).map((person) => person.name)].map((name) => name.trim()).filter(Boolean))]
    .filter((name) => !paused.has(name)).sort();
};

// 只攔截新增的暫停人員，既有班次可保留或移除。
export const getNewPausedAssignments = (
  assignments: Assignment[],
  existing: Assignment[],
  staff: StaffAvailability[],
): string[] => {
  const names = (value: string) => value.split(",").map((name) => name.trim()).filter(Boolean);
  const blocked = new Set<string>();
  for (const shift of assignments) {
    const originalNames = new Set(existing.filter((old) => old.category === shift.category && old.date === shift.date && old.location === shift.location).flatMap((old) => names(old.staffNames)));
    for (const name of names(shift.staffNames)) {
      if (!originalNames.has(name) && staff.some((person) => person.name.trim() === name && person.category === shift.category && isStaffSchedulingPaused(person))) blocked.add(name);
    }
  }
  return [...blocked];
};
