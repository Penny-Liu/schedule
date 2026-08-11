import type { RadiographerDailyWorkload } from "../types";

export const DAILY_WORKLOAD_FIELD_KEYS = [
  "mr",
  "mrLargeMale",
  "mrLargeFemale",
  "mrMedium",
  "mrSmall",
  "us",
  "usA",
  "usBreast",
  "usHeart",
  "usThy",
  "usCCA",
  "usNeck",
  "usPelvisFemale",
  "usPelvisMale",
  "usFibrosis",
  "ct",
  "cta",
  "ctaPostProcessing",
  "dx",
  "mg",
  "bmd",
  "reportTyping",
  "proofreader",
  "tsmcReport",
] as const satisfies readonly (keyof RadiographerDailyWorkload)[];

type DailyWorkloadField = (typeof DAILY_WORKLOAD_FIELD_KEYS)[number];

export type EditableDailyWorkloadRow = Partial<RadiographerDailyWorkload> & {
  name?: string;
};

const getName = (row: EditableDailyWorkloadRow) =>
  row.radiographerName || row.name || "";

const getNumericValue = (
  row: EditableDailyWorkloadRow | undefined,
  field: DailyWorkloadField,
) => {
  const value = Number(row?.[field] || 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
};

export const buildChangedDailyWorkloadRecords = (
  date: string,
  editedRows: EditableDailyWorkloadRow[],
  currentRows: EditableDailyWorkloadRow[],
): Partial<RadiographerDailyWorkload>[] => {
  const currentByName = new Map(
    currentRows.map((row) => [getName(row), row] as const),
  );

  return editedRows.flatMap((editedRow) => {
    const radiographerName = getName(editedRow);
    if (!radiographerName) return [];

    const currentRow = currentByName.get(radiographerName);
    const hasChanged = DAILY_WORKLOAD_FIELD_KEYS.some(
      (field) =>
        getNumericValue(editedRow, field) !==
        getNumericValue(currentRow, field),
    );
    if (!hasChanged) return [];

    const record: Partial<RadiographerDailyWorkload> = {
      date,
      radiographerName,
    };
    DAILY_WORKLOAD_FIELD_KEYS.forEach((field) => {
      (record as Record<string, unknown>)[field] = getNumericValue(
        editedRow,
        field,
      );
    });
    return [record];
  });
};

export const mergeDailyWorkloadRecords = (
  currentRows: RadiographerDailyWorkload[],
  savedRows: Partial<RadiographerDailyWorkload>[],
): RadiographerDailyWorkload[] => {
  const merged = [...currentRows];
  savedRows.forEach((savedRow) => {
    if (!savedRow.date || !savedRow.radiographerName) return;
    const index = merged.findIndex(
      (row) =>
        row.date === savedRow.date &&
        row.radiographerName === savedRow.radiographerName,
    );
    if (index >= 0) {
      merged[index] = { ...merged[index], ...savedRow };
    } else {
      merged.push(savedRow as RadiographerDailyWorkload);
    }
  });
  return merged;
};
