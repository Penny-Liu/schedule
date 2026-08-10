import { describe, expect, it } from "vitest";
import {
  DateEventType,
  Shift,
  SPECIAL_ROLES,
  StationDefault,
} from "../types";
import {
  getAutomaticRadiographerWorkTime,
  isWeekendOrRadiographerHoliday,
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
    [StationDefault.FLOOR_CONTROL, [], "07:30-15:30"],
    [StationDefault.CT, [SPECIAL_ROLES.OPENING], "07:00-15:00"],
    [StationDefault.CT, [SPECIAL_ROLES.LATE], "09:00-17:00"],
    [StationDefault.MR1_5T, [], "07:30-15:30"],
    [StationDefault.MR3T, [], "08:00-16:00"],
    [StationDefault.CT, [SPECIAL_ROLES.ASSIST], "08:30-16:30"],
    [StationDefault.CT, [SPECIAL_ROLES.SCHEDULER], "09:00-17:00"],
    [StationDefault.REMOTE, [], "09:00-17:00"],
  ])("assigns %s with roles %j", (station, roles, expected) => {
    const shift = makeShift({ station, specialRoles: roles });
    expect(getAutomaticRadiographerWorkTime(shift, [shift], false)).toBe(
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
        false,
      ),
    ).toBe("07:00-15:00");

    expect(
      getAutomaticRadiographerWorkTime(
        makeShift({
          station: StationDefault.MR3T,
          specialRoles: [SPECIAL_ROLES.LATE],
        }),
        [],
        false,
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

    expect(getAutomaticRadiographerWorkTime(mr3, [mr15, mr3], false)).toBe(
      "07:30-15:30",
    );
  });

  it("moves every 09:00 result to 08:30 on weekends or holidays", () => {
    const late = makeShift({ specialRoles: [SPECIAL_ROLES.LATE] });
    const remote = makeShift({ station: StationDefault.REMOTE });

    expect(getAutomaticRadiographerWorkTime(late, [late], true)).toBe(
      "08:30-16:30",
    );
    expect(getAutomaticRadiographerWorkTime(remote, [remote], true)).toBe(
      "08:30-16:30",
    );
    expect(
      getAutomaticRadiographerWorkTime(
        makeShift({ workTime: "09:00-17:00" }),
        [],
        true,
      ),
    ).toBe("08:30-16:30");
  });

  it("assigns radiographer assistants at 09:30 on weekdays and 09:00 on holidays", () => {
    const assistant = makeShift({ station: StationDefault.ASSISTANT });

    expect(
      getAutomaticRadiographerWorkTime(assistant, [assistant], false, true),
    ).toBe("09:30-17:30");
    expect(
      getAutomaticRadiographerWorkTime(assistant, [assistant], true, true),
    ).toBe("09:00-17:00");
  });

  it("recognizes the assistant station even without an explicit role flag", () => {
    const assistant = makeShift({ station: StationDefault.ASSISTANT });

    expect(getAutomaticRadiographerWorkTime(assistant, [assistant], false)).toBe(
      "09:30-17:30",
    );
  });

  it("leaves stations without a specified rule unchanged", () => {
    expect(
      getAutomaticRadiographerWorkTime(makeShift(), [makeShift()], false),
    ).toBeNull();
  });
});

describe("weekend and holiday detection", () => {
  it("recognizes Saturday, Sunday, national holidays and closed dates", () => {
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

    expect(isWeekendOrRadiographerHoliday("2026-08-08", [])).toBe(true);
    expect(isWeekendOrRadiographerHoliday("2026-08-09", [])).toBe(true);
    expect(isWeekendOrRadiographerHoliday("2026-08-12", holidays)).toBe(true);
    expect(isWeekendOrRadiographerHoliday("2026-08-13", holidays)).toBe(true);
    expect(isWeekendOrRadiographerHoliday("2026-08-10", holidays)).toBe(false);
  });
});
