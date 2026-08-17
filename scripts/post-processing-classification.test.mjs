import { describe, expect, it } from "vitest";
import { getPostProcessingWorkloadField } from "./post-processing-classification.mjs";

describe("Salesforce post-processing workload classification", () => {
  it.each([
    ["CT", "cta_post_processing"],
    ["ct", "cta_post_processing"],
    [" MR ", "mr_post_processing"],
    ["MR", "mr_post_processing"],
    ["US", null],
    [null, null],
  ])("maps resource category %s to %s", (category, expected) => {
    expect(getPostProcessingWorkloadField(category)).toBe(expected);
  });
});
