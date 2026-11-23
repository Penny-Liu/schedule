import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import ExamDurationStandardSettings from './ExamDurationStandardSettings';
import {UserRole,type User} from '../../types';
it('starts collapsed and offers manager edits while viewers see shared values',()=>{
 const render=(role:UserRole)=>renderToStaticMarkup(<ExamDurationStandardSettings values={{mrSmall:45}} user={{role} as User} onSaved={async()=>{}}/>);
 const admin=render(UserRole.SYSTEM_ADMIN);expect(admin).toContain('標準時間設定');expect(admin).not.toContain('<details open');expect(admin).toContain('儲存共用標準');expect(admin).toContain('value="45"');expect(admin).toContain('不列入耗時');
 const viewer=render(UserRole.RADIOGRAPHER_STAFF);expect(viewer).not.toContain('<input');expect(viewer).not.toContain('儲存共用標準');expect(viewer).toContain('45');
});
