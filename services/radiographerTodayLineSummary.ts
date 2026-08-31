export interface PhysicianWorkloadCounts {
  count_da_tao_5: number;
  count_xiao_tao_4: number;
  count_xiao_tao_3: number;
  count_wu_2: number;
  count_wu_1: number;
  count_dazhi_1: number;
}

const formatCount = (value: number): string =>
  Number((Number(value) || 0).toFixed(1)).toString();

export const formatImagingDoctorWorkloadLine = (
  displayAlias: string,
  workload: PhysicianWorkloadCounts | undefined,
  suffix = "",
): string => {
  if (!workload) {
    return `${displayAlias}  -(無資料)${suffix ? ` ${suffix}` : ""}`;
  }

  const big = Number(workload.count_da_tao_5) || 0;
  const small =
    (Number(workload.count_xiao_tao_4) || 0) +
    (Number(workload.count_xiao_tao_3) || 0);
  const none =
    (Number(workload.count_wu_2) || 0) +
    (Number(workload.count_wu_1) || 0);
  const dazhi = Number(workload.count_dazhi_1) || 0;
  const total = Math.round(big + small + none + dazhi);
  const units = Math.round(
    big * 5 +
      (Number(workload.count_xiao_tao_4) || 0) * 4 +
      (Number(workload.count_xiao_tao_3) || 0) * 3 +
      (Number(workload.count_wu_2) || 0) * 2 +
      (Number(workload.count_wu_1) || 0) +
      dazhi,
  );
  const parts: string[] = [];

  if (big > 0) parts.push(`${formatCount(big)}大`);
  if (small > 0) parts.push(`${formatCount(small)}小`);
  if (none > 0) parts.push(`${formatCount(none)}無`);
  if (dazhi > 0) parts.push(`${formatCount(dazhi)}直`);

  const details = parts.length > 0 ? ` (${parts.join(" ")})` : "";
  const core = `${displayAlias}  ${total}${details} →${units} 單位`;
  return suffix ? `${core} ${suffix}` : core;
};

export const normalizeRadiographerTodaySectionTemplate = (
  template: string,
): string =>
  template
    .split("\n")
    .filter(
      (line) =>
        !/^\s*(?:輔班|排班)\s*[:：]\s*{{(?:assist|scheduler)}}\s*$/.test(
          line,
        ),
    )
    .map((line) => {
      if (/^\s*北投\s*[:：].*{{beitou_count}}/.test(line)) {
        return "北投：{{beitou_count}} (客戶：{{beitou_clients}}  CTA：{{beitou_cta}})";
      }
      if (/{{floor_control}}/.test(line)) return "場控：{{floor_control}}";
      if (/^\s*MR\s*[:：].*{{mr}}/.test(line)) return "MR : {{mr}}";
      if (/^\s*US\s*[:：].*{{us}}/.test(line)) return "US：{{us}}";
      if (/^\s*CT\s*[:：].*{{ct}}/.test(line)) return "CT: {{ct}}";
      if (/^\s*BMD\s*[:：].*{{bmd}}/.test(line)) return "BMD :{{bmd}}";
      return line;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
