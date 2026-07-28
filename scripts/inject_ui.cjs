const fs = require('fs');

const path = '/Users/liuyaping/Downloads/schedule/components/dashboard/DailyStatsRows.tsx';
let content = fs.readFileSync(path, 'utf8');

const generateRows = (prefix, displayPrefix) => {
    return [
        { key: `${prefix}_ultrasound_thyroid`, label: `${displayPrefix}甲狀腺<br />超音波`, color: 'text-indigo-600' },
        { key: `${prefix}_ultrasound_cca`, label: `${displayPrefix}頸動脈<br />超音波`, color: 'text-indigo-600' },
        { key: `${prefix}_ultrasound_abdomen`, label: `${displayPrefix}腹部<br />超音波`, color: 'text-indigo-600' },
        { key: `${prefix}_ultrasound_breast`, label: `${displayPrefix}乳房<br />超音波`, color: 'text-indigo-600' },
        { key: `${prefix}_ultrasound_pelvic`, label: `${displayPrefix}骨盆腔<br />超音波`, color: 'text-indigo-600' },
    ].map(item => `
            <tr className="bg-slate-50 ${item.color}">
                <td className={\`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] \${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}\`}>
                    <div className="text-[10px] font-bold flex items-center justify-end pr-2 text-right">${item.label}</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.${item.key} || 0}
                                onChange={(e) => db.updateDailyStats(date, { ${item.key}: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>`).join('');
};

const beitouRows = generateRows('beitou', '北投');
const dazhiRows = generateRows('dazhi', '大直');

const beitouTarget = `            <tr className="bg-slate-50 text-rose-600">
                <td className={\`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] \${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}\`}>
                    <div className="text-[10px] font-bold flex items-center justify-end pr-2 text-right">北投肝纖維<br />超音波</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.beitou_ultrasound_fibrosis || 0}
                                onChange={(e) => db.updateDailyStats(date, { beitou_ultrasound_fibrosis: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>`;

content = content.replace(beitouTarget, beitouTarget + beitouRows);

const dazhiTarget = `            <tr className="bg-slate-50 text-rose-600">
                <td className={\`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] \${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}\`}>
                    <div className="text-[10px] font-bold flex items-center justify-end pr-2 text-right">大直肝纖維<br />超音波</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.dazhi_ultrasound_fibrosis || 0}
                                onChange={(e) => db.updateDailyStats(date, { dazhi_ultrasound_fibrosis: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>`;

content = content.replace(dazhiTarget, dazhiTarget + dazhiRows);

fs.writeFileSync(path, content, 'utf8');
