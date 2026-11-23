import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import HealthMgmtLoad from './HealthMgmtLoad';
it('shows separate campus rows and does not claim an unsynchronized day is zero load',()=>{
 const html=renderToStaticMarkup(<table><tbody><HealthMgmtLoad dates={['2026-11-13']} location="全部" shifts={[]} staff={[]}/></tbody></table>);
 expect(html).toContain('北投・需求 S');expect(html).toContain('大直・人力 T');expect(html).toContain('尚未同步');expect(html).not.toContain('0.0%');
});
it('shows known H support capacity and warns when the support source has not finished loading',()=>{
 const html=renderToStaticMarkup(<table><tbody><HealthMgmtLoad dates={['2026-11-13']} location="北投" shifts={[]} staff={[{id:'a',name:'同仁甲',isActive:true,location:'北投'}]} supportShifts={[{date:'2026-11-13',location:'北投',staff_names:'同仁甲'}]} supportReady={false}/></tbody></table>);
 expect(html).toContain('30 (1人)・待確認');
});
