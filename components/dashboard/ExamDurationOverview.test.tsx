import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import ExamDurationComparison from './ExamDurationComparison';
import type {DurationComparison} from '../../services/examDurationComparison';
it('renders the overview with quality context and reporting but no ranking controls',()=>{
 const row={radiographer_id:'a',key:'a',radiographer_name:'甲',fieldKey:'usA',category:'US',label:'腹',value:5,eligible:true,comparable:true,durationZone:'faster',flowCount:12,sampleCount:12,sampleUnit:'項',coverage:1,reference:'樣本較充足',benchmark:6,referenceMedian:6,comparisonUnit:'分／醫令',basis:'均攤估計'} as DurationComparison;
 const html=renderToStaticMarkup(<ExamDurationComparison entries={[row]} staff="" onStaff={()=>{}} view="overview" period="本週" filters="北投"/>);
 expect(html).toContain('全科作業概況');expect(html).toContain('品質資料：尚未串接');expect(html).toContain('標準時間內');expect(html).toContain('複製報告摘要');
 expect(html).not.toContain('耗時排序依據');expect(html).not.toContain('由小到大');
});
