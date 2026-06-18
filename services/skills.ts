import { StationDefault } from "../types";

export interface SkillDefinition {
  id: string; // e.g., 'R1', 'C1'
  name: string; // e.g., 'X ray BMD'
  category: string; // e.g., 'Routine'
  description?: string;
  autoStations: string[]; // Stations to automatically grant when this skill is unlocked
}

export const SKILL_CATEGORIES = ["Routine", "CT", "MRI", "Sono", "Mammo"] as const;

export const RADIOGRAPHER_SKILLS: SkillDefinition[] = [
  // Routine
  {
    id: "R1",
    name: "X ray BMD",
    category: "Routine",
    autoStations: [StationDefault.DX, StationDefault.BMD_DX],
  },
  // CT
  {
    id: "C1",
    name: "LDCT",
    category: "CT",
    autoStations: ["CT1", "CT2"],
  },
  {
    id: "C2",
    name: "CTA",
    category: "CT",
    autoStations: ["CT1", "CT2"],
  },
  {
    id: "C3",
    name: "CTA後處理",
    category: "CT",
    autoStations: [], 
  },
  // MRI
  {
    id: "M1",
    name: "全身",
    category: "MRI",
    autoStations: ["MR1", "MR2"],
  },
  {
    id: "M2",
    name: "四肢",
    category: "MRI",
    autoStations: ["MR1", "MR2"],
  },
  {
    id: "M3",
    name: "心臟",
    category: "MRI",
    autoStations: ["MR1", "MR2"],
  },
  // Sono
  {
    id: "S1",
    name: "CCA+THY",
    category: "Sono",
    autoStations: ["US1", "US2", "US3", "US4", "US5"],
  },
  {
    id: "S2",
    name: "A+P",
    category: "Sono",
    autoStations: ["US1", "US2", "US3", "US4", "US5"],
  },
  {
    id: "S3",
    name: "Breast",
    category: "Sono",
    autoStations: ["US1", "US2", "US3", "US4", "US5"],
  },
  {
    id: "S4",
    name: "Heart",
    category: "Sono",
    autoStations: ["US1", "US2", "US3", "US4", "US5"],
  },
  // Mammo
  {
    id: "MG",
    name: "MG",
    category: "Mammo",
    autoStations: [StationDefault.MG],
  },
];

export const getSkillById = (id: string) => RADIOGRAPHER_SKILLS.find(s => s.id === id);

// This helper determines the automatic stations a user should have based on their unlocked skills
export const getAutoCapabilitiesFromSkills = (unlockedSkills: string[]): string[] => {
  if (!unlockedSkills) return [];
  const stations = new Set<string>();
  unlockedSkills.forEach(skillId => {
    const def = getSkillById(skillId);
    if (def) {
      def.autoStations.forEach(st => stations.add(st));
    }
  });
  return Array.from(stations);
};
