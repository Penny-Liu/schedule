import { supabase } from "./supabaseClient";

interface RadiographerPrivateProfileRow {
  user_id: string;
  birth_date: string;
}

export const fetchRadiographerBirthDate = async (
  userId: string,
): Promise<string> => {
  const { data, error } = await supabase
    .from("radiographer_private_profiles")
    .select("birth_date")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.birth_date || "";
};

export const fetchRadiographerBirthDates = async (
  userIds: string[],
): Promise<Record<string, string>> => {
  const distinctUserIds = [...new Set(userIds.filter(Boolean))];
  if (distinctUserIds.length === 0) return {};

  const { data, error } = await supabase
    .from("radiographer_private_profiles")
    .select("user_id,birth_date")
    .in("user_id", distinctUserIds);

  if (error) throw error;
  return Object.fromEntries(
    ((data || []) as RadiographerPrivateProfileRow[]).map((row) => [
      row.user_id,
      row.birth_date,
    ]),
  );
};

export const saveRadiographerBirthDate = async (
  userId: string,
  birthDate: string | null,
): Promise<void> => {
  if (!birthDate) {
    const { error } = await supabase
      .from("radiographer_private_profiles")
      .delete()
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("radiographer_private_profiles").upsert(
    {
      user_id: userId,
      birth_date: birthDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
};
