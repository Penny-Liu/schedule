import { describe, expect, it } from "vitest";
import {
  DateEventType,
  Shift,
  SPECIAL_ROLES,
  StationDefault,
} from "../types";
import {
  getAutomaticRadiographerWorkTime,
  getRadiographerWorkDayType,
} from "./radiographerWorkTime";

const makeShift = (overrides: Partial<Shift> = {}): Shift => ({
  id: "shift-1",
  userId: "user-1",
  date: "2026-08-10",
  station: StationDefault.CT,
  specialRoles: [],
  ...overrides,
});

describe("automatic radiographer work times", () => {
  it.each([
    [StationDefault.FLOOR_CONTROL, [], "09:00-17:00"],
    [StationDefault.CT, [SPECIAL_ROLES.OPENING], "07:00-15:00"],
    [StationDefault.CT, [SPECIAL_ROLES.LATE], "09:00-17:00"],
    [StationDefault.MR1_5T, [], "07:30-15:30"],
    [StationDefault.MR3T, [], "08:00-16:00"],
    [StationDefault.CT, [SPECIAL_ROLES.ASSIST], "07:30-15:30"],
    [StationDefault.CT, [SPECIAL_ROLES.SCHEDULER], "09:00-17:00"],
    [StationDefault.REMOTE, [], "09:00-17:00"],
  ])("assigns %s with roles %j", (station, roles, expected) => {
    const shift = makeShift({ station, specialRoles: roles });
    expect(getAutomaticRadiographerWorkTime(shift, [shift], "WEEKDAY")).toBe(
      expected,
    );
  });

  it("uses special-duty time before MR or assistant defaults", () => {
    expect(
      getAutomaticRadiographerWorkTime(
        makeShift({
          station: StationDefault.MR1_5T,
          specialRoles: [SPECIAL_ROLES.OPENING, SPECIAL_ROLES.ASSIST],
        }),
        [],
        "WEEKDAY",
      ),
    ).toBe("07:00-15:00");

    expect(
      getAutomaticRadiographerWorkTime(
        makeShift({
          station: StationDefault.MR3T,
          specialRoles: [SPECIAL_ROLES.LATE],
        }),
        [],
        "WEEKDAY",
      ),
    ).toBe("09:00-17:00");
  });

  it("starts MR3T at 07:30 when MR1.5T has the late duty", () => {
    const mr15 = makeShift({
      id: "mr15",
      station: StationDefault.MR1_5T,
      specialRoles: [SPECIAL_ROLES.LATE],
    });
    const mr3 = makeShift({ id: "mr3", station: StationDefault.MR3T });

    expect(getAutomaticRadiographerWorkTime(mr3, [mr15, mr3], "WEEKDAY")).toBe(
      "07:30-15:30",
    );
  });

  it("uses 08:30 for Saturday floor-control and late duties only", () => {
    const late = makeShift({ specialRoles: [SPECIAL_ROLES.LATE] });
    const floorControl = makeShift({ station: StationDefault.FLOOR_CONTROL });
    const remote = makeShift({ station: StationDefault.REMOTE });

    expect(getAutomaticRadiographerWorkTime(late, [late], "SATURDAY")).toBe(
      "08:30-16:30",
    );
    expect(
      getAutomaticRadiographerWorkTime(
        floorControl,
        [floorControl],
        "SATURDAY",
      ),
    ).toBe("08:30-16:30");
    expect(getAutomaticRadiographerWorkTime(remote, [remote], "SATURDAY")).toBe(
      "09:00-17:00",
    );
  });

  it("uses 08:00 on Sundays and holidays except opening, assist and MR1.5T", () => {
    const standard = makeShift({ station: StationDefault.CT });
    const late = makeShift({ specialRoles: [SPECIAL_ROLES.LATE] });
    const opening = makeShift({ specialRoles: [SPECIAL_ROLES.OPENING] });
    const assist = makeShift({ specialRoles: [SPECIAL_ROLES.ASSIST] });
    const mr15 = makeShift({ station: StationDefault.MR1_5T });

    expect(
      getAutomaticRadiographerWorkTime(
        standard,
        [standard],
        "SUNDAY_OR_HOLIDAY",
      ),
    ).toBe("08:00-16:00");
    expect(
      getAutomaticRadiographerWorkTime(late, [late], "SUNDAY_OR_HOLIDAY"),
    ).toBe("08:00-16:00");
    expect(
      getAutomaticRadiographerWorkTime(
        opening,
        [opening],
        "SUNDAY_OR_HOLIDAY",
      ),
    ).toBe("07:00-15:00");
    expect(
      getAutomaticRadiographerWorkTime(
        assist,
        [assist],
        "SUNDAY_OR_HOLIDAY",
      ),
    ).toBe("07:30-15:30");
    expect(
      getAutomaticRadiographerWorkTime(mr15, [mr15], "SUNDAY_OR_HOLIDAY"),
    ).toBe("07:30-15:30");
  });

  it("uses 08:00 on Sundays even when no weekday rule exists", () => {
    const standard = makeShift({ station: StationDefault.US1 });
    expect(
      getAutomaticRadiographerWorkTime(
        standard,
        [standard],
        "SUNDAY_OR_HOLIDAY",
      ),
    ).toBe("08:00-16:00");
  });

  it("keeps Saturday stations without a Saturday-specific rule unchanged", () => {
    expect(
      getAutomaticRadiographerWorkTime(makeShift(), [makeShift()], "SATURDAY"),
    ).toBeNull();
  });

  it("assigns radiographer assistants at 09:30 on weekdays and 09:00 on weekends or holidays", () => {
    const assistant = makeShift({ station: StationDefault.ASSISTANT });

    expect(
      getAutomaticRadiographerWorkTime(assistant, [assistant], "WEEKDAY", true),
    ).toBe("09:30-17:30");
    expect(
      getAutomaticRadiographerWorkTime(assistant, [assistant], "SATURDAY", true),
    ).toBe("09:00-17:00");
    expect(
      getAutomaticRadiographerWorkTime(
        assistant,
        [assistant],
        "SUNDAY_OR_HOLIDAY",
        true,
      ),
    ).toBe("09:00-17:00");
  });

  it("recognizes the assistant station even without an explicit role flag", () => {
    const assistant = makeShift({ station: StationDefault.ASSISTANT });

    expect(
      getAutomaticRadiographerWorkTime(assistant, [assistant], "WEEKDAY"),
    ).toBe("09:30-17:30");
  });

  it("leaves weekday stations without a specified rule unchanged", () => {
    expect(
      getAutomaticRadiographerWorkTime(makeShift(), [makeShift()], "WEEKDAY"),
    ).toBeNull();
  });
});

describe("radiographer work day detection", () => {
  it("distinguishes weekdays, Saturdays, Sundays and configured holidays", () => {
    const holidays = [
      {
        date: "2026-08-12",
        name: "國定假日",
        type: DateEventType.NATIONAL,
      },
      {
        date: "2026-08-13",
        name: "休診",
        type: DateEventType.CLOSED,
      },
    ];

    expect(getRadiographerWorkDayType("2026-08-08", [])).toBe("SATURDAY");
    expect(getRadiographerWorkDayType("2026-08-09", [])).toBe(
      "SUNDAY_OR_HOLIDAY",
    );
    expect(getRadiographerWorkDayType("2026-08-12", holidays)).toBe(
      "SUNDAY_OR_HOLIDAY",
    );
    expect(getRadiographerWorkDayType("2026-08-13", holidays)).toBe(
      "SUNDAY_OR_HOLIDAY",
    );
    expect(getRadiographerWorkDayType("2026-08-10", holidays)).toBe(
      "WEEKDAY",
    );
  });

  it("treats a configured holiday on Saturday as a holiday rule", () => {
    expect(
      getRadiographerWorkDayType("2026-08-08", [
        {
          date: "2026-08-08",
          name: "國定假日",
          type: DateEventType.NATIONAL,
        },
      ]),
    ).toBe("SUNDAY_OR_HOLIDAY");
  });
});
