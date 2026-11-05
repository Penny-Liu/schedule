import { describe, expect, it } from "vitest";
import { AdministrativeCategory as C } from "../types";
import { getAvailableAdministrativeNames, getNewPausedAssignments, isStaffSchedulingPaused } from "./administrativeStaffAvailability";

const paused = { name: "甲", category: C.GENE, scheduling_paused: true };
const active = { name: "乙", category: C.GENE };
const shift = { category: C.GENE, date: "2026-11-02", location: "北投", staffNames: "甲" };

describe("gene staff scheduling pause", () => {
  it("excludes paused staff even when historical names include them", () => {
    expect(getAvailableAdministrativeNames(C.GENE, ["甲", " 丙 ", "丙"], [paused, active])).toEqual(["丙", "乙"].sort());
  });
  it("restores eligibility after explicit resume", () => {
    const resumed = { ...paused, scheduling_paused: false };
    expect(getAvailableAdministrativeNames(C.GENE, [], [resumed])).toEqual(["甲"]);
    expect(getNewPausedAssignments([shift], [], [resumed])).toEqual([]);
  });
  it("blocks new typed assignments but preserves existing assignments and allows removal", () => {
    expect(getNewPausedAssignments([shift], [], [paused])).toEqual(["甲"]);
    expect(getNewPausedAssignments([shift], [shift], [paused])).toEqual([]);
    expect(getNewPausedAssignments([], [shift], [paused])).toEqual([]);
    expect(getNewPausedAssignments([{ ...shift, staffNames: "甲, 乙" }], [shift], [paused, active])).toEqual([]);
  });
  it("blocks moving paused staff to another date or site", () => {
    expect(getNewPausedAssignments([{ ...shift, location: "大直" }], [shift], [paused])).toEqual(["甲"]);
    expect(getNewPausedAssignments([{ ...shift, date: "2026-11-03" }], [shift], [paused])).toEqual(["甲"]);
  });
  it("keeps categories separate and supports H staff", () => {
    expect(isStaffSchedulingPaused({ ...paused, category: C.IT })).toBe(false);
    expect(isStaffSchedulingPaused({ ...paused, category: C.GENE_H })).toBe(true);
    expect(getNewPausedAssignments([{ ...shift, category: C.GENE_H }], [], [paused])).toEqual([]);
    expect(getAvailableAdministrativeNames(C.GENE_H, ["甲"], [paused])).toEqual(["甲"]);
  });
});
