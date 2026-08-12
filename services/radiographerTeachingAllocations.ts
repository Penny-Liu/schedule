import { supabase } from "./supabaseClient";

export const TEACHING_WORKLOAD_FIELDS = [
  { key: "mr", label: "MR醫令" },
  { key: "mrLargeMale", label: "MR大男" },
  { key: "mrLargeFemale", label: "MR大女" },
  { key: "mrMedium", label: "MR中" },
  { key: "mrSmall", label: "MR小" },
  { key: "us", label: "US" },
  { key: "usA", label: "腹超" },
  { key: "usBreast", label: "乳超" },
  { key: "usHeart", label: "心超" },
  { key: "usThy", label: "甲狀腺" },
  { key: "usCCA", label: "頸動脈" },
  { key: "usNeck", label: "頸部" },
  { key: "usPelvisFemale", label: "女骨盆" },
  { key: "usPelvisMale", label: "男骨盆" },
  { key: "usFibrosis", label: "肝纖" },
  { key: "ct", label: "CT" },
  { key: "cta", label: "CTA" },
  { key: "ctaPostProcessing", label: "CTA後處理" },
  { key: "dx", label: "DX" },
  { key: "mg", label: "MG" },
  { key: "bmd", label: "BMD" },
] as const;

export type TeachingWorkloadField =
  (typeof TEACHING_WORKLOAD_FIELDS)[number]["key"];

export interface RadiographerTeachingAllocation {
  id?: string;
  date: string;
  studentUserId: string;
  teacherUserId: string;
  workloadField: TeachingWorkloadField;
  amount: number;
  createdBy?: string;
}

export const getTeachingCategoryForField = (
  field: TeachingWorkloadField,
): "MR" | "CT" | "超音波" | "DX" | "MG" | "BMD" => {
  if (field.startsWith("mr")) return "MR";
  if (field.startsWith("us")) return "超音波";
  if (field === "ct" || field === "cta" || field === "ctaPostProcessing") {
    return "CT";
  }
  return field.toUpperCase() as "DX" | "MG" | "BMD";
};

export const validateTeachingAllocations = (
  allocations: RadiographerTeachingAllocation[],
  availableByDateAndField: Record<string, Record<string, number>>,
): string[] => {
  const errors: string[] = [];
  const totals = new Map<string, number>();
  const assignmentKeys = new Set<string>();

  allocations.forEach((allocation, index) => {
    if (!allocation.date || !allocation.teacherUserId || !allocation.workloadField) {
      errors.push(`第 ${index + 1} 筆教學分配資料不完整`);
      return;
    }
    if (!Number.isFinite(allocation.amount) || allocation.amount <= 0) {
      errors.push(`第 ${index + 1} 筆教學數量必須大於 0`);
    }
    if (allocation.studentUserId === allocation.teacherUserId) {
      errors.push(`第 ${index + 1} 筆不可將學員本人設為老師`);
    }
    const key = `${allocation.date}|${allocation.workloadField}`;
    totals.set(key, (totals.get(key) || 0) + allocation.amount);
    const assignmentKey = `${key}|${allocation.teacherUserId}`;
    if (assignmentKeys.has(assignmentKey)) {
      errors.push(`第 ${index + 1} 筆與前面的日期、項目及老師重複`);
    }
    assignmentKeys.add(assignmentKey);
  });

  totals.forEach((allocated, key) => {
    const [date, field] = key.split("|");
    const available = Number(availableByDateAndField[date]?.[field] || 0);
    if (allocated > available) {
      const label =
        TEACHING_WORKLOAD_FIELDS.find((item) => item.key === field)?.label || field;
      errors.push(
        `${date} ${label} 分配 ${allocated} 件，超過當日實際工作量 ${available} 件`,
      );
    }
  });

  return [...new Set(errors)];
};

const mapAllocationFromDb = (row: Record<string, unknown>): RadiographerTeachingAllocation => ({
  id: String(row.id),
  date: String(row.date),
  studentUserId: String(row.student_user_id),
  teacherUserId: String(row.teacher_user_id),
  workloadField: row.workload_field as TeachingWorkloadField,
  amount: Number(row.amount || 0),
  createdBy: row.created_by ? String(row.created_by) : undefined,
});

export const fetchTeachingAllocationsByRange = async (
  startDate: string,
  endDate: string,
): Promise<RadiographerTeachingAllocation[]> => {
  const { data, error } = await supabase
    .from("radiographer_teaching_allocations")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date");
  if (error) throw error;
  return (data || []).map(mapAllocationFromDb);
};

export const replaceTeachingAllocationsForStudent = async (
  studentUserId: string,
  dates: string[],
  allocations: RadiographerTeachingAllocation[],
  createdBy?: string,
): Promise<RadiographerTeachingAllocation[]> => {
  if (dates.length === 0) return [];

  const { data: existing, error: fetchError } = await supabase
    .from("radiographer_teaching_allocations")
    .select("id, date, student_user_id, teacher_user_id, workload_field")
    .eq("student_user_id", studentUserId)
    .in("date", dates);
  if (fetchError) throw fetchError;

  const desiredKeys = new Set(
    allocations.map(
      (item) => `${item.date}|${item.teacherUserId}|${item.workloadField}`,
    ),
  );
  const idsToDelete = (existing || [])
    .filter(
      (row) =>
        !desiredKeys.has(
          `${row.date}|${row.teacher_user_id}|${row.workload_field}`,
        ),
    )
    .map((row) => row.id);

  if (allocations.length > 0) {
    const payload = allocations.map((item) => ({
      date: item.date,
      student_user_id: studentUserId,
      teacher_user_id: item.teacherUserId,
      workload_field: item.workloadField,
      amount: item.amount,
      created_by: item.createdBy || createdBy || null,
      updated_at: new Date().toISOString(),
    }));
    const { error: upsertError } = await supabase
      .from("radiographer_teaching_allocations")
      .upsert(payload, {
        onConflict: "date,student_user_id,teacher_user_id,workload_field",
      });
    if (upsertError) throw upsertError;
  }

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("radiographer_teaching_allocations")
      .delete()
      .in("id", idsToDelete);
    if (deleteError) throw deleteError;
  }

  const { data, error } = await supabase
    .from("radiographer_teaching_allocations")
    .select("*")
    .eq("student_user_id", studentUserId)
    .in("date", dates)
    .order("date");
  if (error) throw error;
  return (data || []).map(mapAllocationFromDb);
};
