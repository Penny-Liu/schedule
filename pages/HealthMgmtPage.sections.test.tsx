import React from 'react';
import {afterEach,describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import HealthMgmtPage, {getMatchedGroupId} from './HealthMgmtPage';
import {db} from '../services/store';
import {UserRole,PERMISSIONS as P,type User} from '../types';
const user={id:'n',name:'測試主管',role:UserRole.HM_SUPERVISOR,isHealthMgmt:true,healthMgmtLocation:'北投',permissions:[P.VIEW_HEALTH_MGMT,P.EDIT_HEALTH_MGMT]} as User;
afterEach(()=>{db.settings.healthMgmtCycles=[];});
describe('health management scheduling and statistics navigation',()=>{
 it('groups Beitou B/D shifts under medical assistants without changing Dazhi codes',()=>{
  expect(getMatchedGroupId('08:00-16:00 B班','北投')).toBe('HA');
  expect(getMatchedGroupId('08:00-16:00 D班','北投')).toBe('HA');
  expect(getMatchedGroupId('08:00-16:00 B班','大直')).toBeNull();
  expect(getMatchedGroupId('08:00-16:00 D班','大直')).toBe('D');
 });
 it('keeps statistics and staff management out of the schedule navigation',()=>{
  const html=renderToStaticMarkup(<HealthMgmtPage currentUser={user}/>);
  expect(html).toContain('健管排班總覽');expect(html).toContain('今日崗位');
  expect(html).not.toContain('title="健管統計數據"');expect(html).not.toContain('title="健管人員管理"');
 });
 it('provides statistics, staff and personal cycles in the separate section',()=>{
  const html=renderToStaticMarkup(<HealthMgmtPage currentUser={user} section="statistics"/>);
  expect(html).toContain('title="健管統計數據"');expect(html).toContain('title="健管人員管理"');expect(html).toContain('個人週期');
  expect(html).not.toContain('title="健管排班總覽"');expect(html).not.toContain('title="麻護排班"');
 });
 it('does not display another campus cycle in the statistics selector',()=>{
  db.settings.healthMgmtCycles=[{id:'n',name:'North-only-cycle',location:'北投',startDate:'2026-11-01',endDate:'2026-11-30'},{id:'s',name:'South-only-cycle',location:'大直',startDate:'2026-11-01',endDate:'2026-11-30'}];
  const html=renderToStaticMarkup(<HealthMgmtPage currentUser={user} section="statistics"/>);
  expect(html).toContain('North-only-cycle');expect(html).not.toContain('South-only-cycle');
 });
});
