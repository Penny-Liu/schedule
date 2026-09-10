export interface MrTeachingAssignment {
  workloadField: string;
  amount: number;
}

// Keep fractional teaching credit while removing binary floating-point noise.
export const normalizeMrTeachingAmount = (amount: number): number =>
  Number(amount.toFixed(10));

export const getAutomaticMrTeachingAmount = (
  field: string,
  actualAmount: number,
  manualAssignments: readonly MrTeachingAssignment[],
  teacherCount: number,
): number => {
  if (teacherCount <= 0) return 0;
  const mrAssignments = manualAssignments.filter((item) =>
    item.workloadField.startsWith("mr"),
  );
  // Partial manual assignments need one unambiguous schedule teacher for the remainder.
  if (mrAssignments.length > 0 && teacherCount !== 1) return 0;
  const assigned = mrAssignments
    .filter((item) => item.workloadField === field)
    .reduce((sum, item) => sum + item.amount, 0);
  return normalizeMrTeachingAmount(
    Math.max(0, actualAmount - assigned) / teacherCount,
  );
};
