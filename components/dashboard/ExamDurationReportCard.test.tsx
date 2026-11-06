import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import ExamDurationReportCard from './ExamDurationReportCard';
import type {DurationComparison} from '../../services/examDurationComparison';
it('offers both report modes and a safe HTTP copy fallback without claiming clipboard success',()=>{
 const row={radiographer_id:'a',radiographer_name:'同仁甲',fieldKey:'usA',category:'US',label:'腹',value:12,standardMinutes:15,eligible:true,comparable:true,flowCount:20,coverage:1,durationZone:'normal'} as DurationComparison;
 const html=renderToStaticMarkup(<ExamDurationReportCard entries={[row]} period="本週" filters="北投"/>);
 expect(html).toContain('同一檢查・全科概況');expect(html).toContain('同一同仁・各項檢查');expect(html).toContain('複製圖片（右鍵方式）');expect(html).toContain('下載目前 PNG');expect(html).not.toContain('已複製目前圖卡');expect(html).toContain('全部選取');expect(html).toContain('全部取消');expect(html).toContain('type="checkbox"');expect(html).toContain('同仁甲');expect(html).not.toContain('圖卡頁次');expect(html).toContain('同一張長圖');
});
