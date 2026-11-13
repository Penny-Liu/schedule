import { describe, expect, it } from "vitest";
import { Shift } from "../types";
import { coversStation, normalizeConcurrentRoles, uniqueDailyShifts } from "./radiographerConcurrentStations";
import { calculateDailyLoadRate } from "../pages/DashboardPage";
const makeShift = (station: string, roles: string[]): Shift => ({id:'s1',userId:'u1',date:'2026-11-14',station,specialRoles:roles});
describe('radiographer concurrent stations', () => {
  it.each([['MR3T','CT'],['BMD/DX','US3'],['CT','US4']])('%s can cover %s while keeping one assignment', (main, secondary) => {
    const shift = makeShift(main, [`兼${secondary}`]);
    expect(coversStation(shift, main)).toBe(true);
    expect(coversStation(shift, secondary)).toBe(true);
    expect(shift.station).toBe(main);
    expect(uniqueDailyShifts([shift, {...shift,id:'duplicate'}],shift.date)).toHaveLength(1);
  });
  it('drops concurrent assignments when moved off clinical work and removes self-assignment', () => {
    expect(normalizeConcurrentRoles('休假',['兼CT','排班'])).toEqual(['排班']);
    expect(normalizeConcurrentRoles('CT',['兼CT','兼US4','兼US4'])).toEqual(['兼US4']);
    expect(coversStation(makeShift('休假',['兼CT']), 'CT')).toBe(false);
  });
  it('uses exactly the same actual supply with or without concurrent stations, including duplicate records', () => {
    const shift = makeShift('MR3T', []);
    const user = {id:'u1',name:'測試',capabilities:['MR3T','CT','US4']} as any;
    const base = calculateDailyLoadRate(shift.date,'beitou',[shift],[user],{});
    expect(base.supply).toBe(48);
    const concurrent = {...shift,specialRoles:['兼CT','兼US4']};
    expect(calculateDailyLoadRate(shift.date,'beitou',[concurrent],[user],{})).toEqual(base);
    expect(calculateDailyLoadRate(shift.date,'beitou',[concurrent,{...concurrent,id:'dup'}],[user],{})).toEqual(base);
  });
});
