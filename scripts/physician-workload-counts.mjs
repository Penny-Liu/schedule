export const getPhysicianWorkloadCounts = (categories) => ({
  count_da_tao_5:
    (categories["大套5"] || 0) + (categories["大套5(無特檢)"] || 0),
  count_xiao_tao_4: categories["小套4"] || 0,
  count_xiao_tao_3: categories["小套3"] || 0,
  count_wu_2: categories["無2"] || 0,
  count_wu_1: categories["無1"] || 0,
  count_dazhi_1: categories["大直1"] || 0,
});
