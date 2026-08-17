export const getPostProcessingWorkloadField = (resourceCategory) => {
  const normalizedCategory = String(resourceCategory || "")
    .trim()
    .toUpperCase();

  if (normalizedCategory === "CT") return "cta_post_processing";
  if (normalizedCategory === "MR") return "mr_post_processing";
  return null;
};
