interface WorkloadNamedRow {
  name: string;
}

interface WorkloadUserRole {
  name: string;
  role: string;
}

export const getRadiographerAssistantNames = (
  users: WorkloadUserRole[],
): Set<string> =>
  new Set(
    users
      .filter((user) => user.role === "RADIOGRAPHER_ASSISTANT")
      .map((user) => user.name),
  );

export const orderMonthlySummaryRows = <T extends WorkloadNamedRow>(
  rows: T[],
  assistantNames: ReadonlySet<string>,
): T[] => [
  ...rows.filter((row) => !assistantNames.has(row.name)),
  ...rows.filter((row) => assistantNames.has(row.name)),
];

export const excludeRowsFromRankedSheets = <T extends WorkloadNamedRow>(
  rows: T[],
  assistantNames: ReadonlySet<string>,
): T[] =>
  rows.filter(
    (row) => row.name !== "劉雅萍" && !assistantNames.has(row.name),
  );
