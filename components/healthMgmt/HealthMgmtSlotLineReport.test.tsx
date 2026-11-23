import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import HealthMgmtSlotLineReport from './HealthMgmtSlotLineReport';
it('shows a directly visible slot section and disables copying before any campus is synchronized',()=>{
 const html=renderToStaticMarkup(<HealthMgmtSlotLineReport text="檢備：23組 × 2＝46 slot" ready={false}/>);
 expect(html).toContain('健管 Slot 計算');expect(html).toContain('複製健管 Slot 到 LINE');expect(html).toContain('disabled');expect(html).toContain('23組 × 2＝46 slot');expect(html).not.toContain('已複製目前');
});
