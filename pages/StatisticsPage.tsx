
import React, { useState, useMemo } from 'react';
import { User, UserRole, SPECIAL_ROLES, StationDefault, DateEventType } from '../types';
import { db } from '../services/store';
import { BarChart3, Calendar, Filter, Download, FileSpreadsheet } from 'lucide-react';
import { utils, writeFile } from 'xlsx';

interface StatisticsPageProps {
    currentUser: User;
}

const StatisticsPage: React.FC<StatisticsPageProps> = ({ currentUser }) => {
    const cycles = db.getCycles();
    // Default to the current cycle (based on today) if found, otherwise first cycle (latest), otherwise 'rolling'
    const [selectedCycleId, setSelectedCycleId] = useState<string>(() => {
        const today = new Date().toISOString().split('T')[0];
        const activeCycle = cycles.find(c => today >= c.startDate && today <= c.endDate);
        if (activeCycle) return activeCycle.id;
        return cycles.length > 0 ? cycles[0].id : 'rolling';
    });
    const [currentDate, setCurrentDate] = useState(new Date());

    // Filter out SYSTEM_ADMIN from statistics
    const users = db.getUsers().filter(u => u.role !== UserRole.SYSTEM_ADMIN);
    const shifts = db.getShifts('', '');
    const holidays = db.getHolidays();

    // Determine Date Range
    const dateRange = useMemo(() => {
        if (selectedCycleId !== 'rolling') {
            const cycle = cycles.find(c => c.id === selectedCycleId);
            if (cycle) {
                const dates = [];
                const start = new Date(cycle.startDate);
                const end = new Date(cycle.endDate);
                if (start <= end) {
                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        dates.push(d.toISOString().split('T')[0]);
                    }
                    return dates;
                }
            }
        }
        // Default: Current month if rolling (or a fixed 30 days)
        const dates = [];
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(d.toISOString().split('T')[0]);
        }
        return dates;
    }, [currentDate, selectedCycleId, cycles]);

    // --- Calculations ---
    const statsData = useMemo(() => {
        return users.map(user => {
            const stats = {
                name: user.name,
                totalWork: 0,
                onSite: 0,
                remote: 0,
                beitou: 0,
                dazhi: 0,
                off: 0,
                floorControl: 0,
                assist: 0,
                opening: 0, // New: 開機
                late: 0,    // New: 晚班
                scheduler: 0, // New: 排班
                bmd: 0,
                ct: 0,
                mr: 0,
                us: 0,
                techSupport: 0,
                remarks: ''
            };

            dateRange.forEach(dateStr => {
                // Get Status
                const status = db.getUserStatusOnDate(user.id, dateStr);
                if (status === 'OFF') {
                    stats.off++;
                    return;
                }

                // Get Shift Info
                let station = StationDefault.UNASSIGNED as string;
                let roles: string[] = [];

                // Check Manual Shift
                const manualShift = shifts.find(s => s.userId === user.id && s.date === dateStr);
                if (manualShift) {
                    station = manualShift.station;
                    roles = manualShift.specialRoles || [];
                } else {
                    // Should be working but unassigned manually? 
                    // In auto-schedule logic, they might be unassigned if no station.
                    // If status is WORK, we count as work.
                }

                stats.totalWork++;

                // --- Location Logic ---
                if (station.includes('遠')) {
                    stats.remote++;
                } else if (station.includes('大直')) {
                    stats.dazhi++;
                } else {
                    // If not Remote and not Dazhi, assume Beitou (Main)
                    // Note: "On-site" usually means physically present (Beitou + Dazhi)
                    stats.beitou++;
                }

                // --- Station Types ---
                if (station.includes('場控')) stats.floorControl++;
                if (station.includes('BMD') || station.includes('DX')) stats.bmd++;
                if (station.includes('CT')) stats.ct++;
                if (station.includes('MR')) stats.mr++;
                if (station.includes('US')) stats.us++;
                if (station.includes('技術支援')) stats.techSupport++;

                // --- Special Roles ---
                if (roles.includes(SPECIAL_ROLES.ASSIST)) stats.assist++;
                if (roles.includes(SPECIAL_ROLES.OPENING)) stats.opening++;
                if (roles.includes(SPECIAL_ROLES.LATE)) stats.late++;
                if (roles.includes(SPECIAL_ROLES.SCHEDULER)) stats.scheduler++;
            });

            // On-site = Total Work - Remote
            stats.onSite = stats.totalWork - stats.remote;

            return stats;
        });
    }, [users, dateRange, shifts]);

    // --- Export Logic (Excel) ---
    const handleExport = () => {
        try {
            // 1. Prepare Data for Excel
            const excelData = statsData.map(row => ({
                "姓名": row.name,
                "上班天數": row.totalWork,
                "現場天數": row.onSite,
                "遠班": row.remote,
                "北投天數": row.beitou,
                "大直天數": row.dazhi,
                "休假": row.off,
                "場控": row.floorControl,
                "輔班": row.assist,
                "BMD/DX": row.bmd,
                "CT": row.ct,
                "MR": row.mr,
                "US": row.us,
                "技術支援": row.techSupport,
                "開機": row.opening,
                "晚班": row.late,
                "排班": row.scheduler,
                "備註": row.remarks
            }));

            // 2. Create Sheet
            const ws = utils.json_to_sheet(excelData);

            // 3. Auto-width columns (simple estimation)
            const wscols = [
                { wch: 10 }, // Name
                { wch: 8 },  // Work
                { wch: 8 },  // OnSite
                { wch: 8 },  // Remote
                { wch: 8 },  // Beitou
                { wch: 8 },  // Dazhi
                { wch: 8 },  // Off
                { wch: 8 },  // Floor
                { wch: 8 },  // Assist
                { wch: 8 },  // BMD
                { wch: 8 },  // CT
                { wch: 8 },  // MR
                { wch: 8 },  // US
                { wch: 10 }, // Tech
                { wch: 8 },  // Opening
                { wch: 8 },  // Late
                { wch: 8 },  // Scheduler
                { wch: 20 }, // Remarks
            ];
            ws['!cols'] = wscols;

            // 4. Create Workbook
            const wb = utils.book_new();
            utils.book_append_sheet(wb, ws, "工作統計");

            // 5. Generate Filename
            const fileName = `工作統計_${selectedCycleId === 'rolling' ? currentDate.toISOString().slice(0, 7) : '週期報表'}.xlsx`;

            // 6. Download
            writeFile(wb, fileName);

        } catch (e) {
            console.error("Excel export failed", e);
            alert('匯出 Excel 失敗，請稍後再試');
        }
    };

    const cycleName = selectedCycleId === 'rolling'
        ? `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月 (自動範圍)`
        : cycles.find(c => c.id === selectedCycleId)?.name;

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="flex-none px-6 py-4 bg-white border-b border-slate-200 shadow-sm z-10">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <BarChart3 size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">工作狀況統計</h2>
                            <p className="text-xs text-slate-500 font-medium">
                                統計範圍: {cycleName}
                                {dateRange.length > 0 && ` (${dateRange[0]} ~ ${dateRange[dateRange.length - 1]})`}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Cycle Selector */}
                        <div className="flex items-center bg-slate-50 hover:bg-slate-100 rounded-lg px-2 py-1.5 transition-colors border border-slate-200">
                            <Filter size={14} className="text-slate-500 mr-2" />
                            <select
                                value={selectedCycleId}
                                onChange={(e) => setSelectedCycleId(e.target.value)}
                                className="text-sm bg-transparent border-none focus:ring-0 text-slate-700 font-medium cursor-pointer py-0 pl-0 pr-8"
                            >
                                {cycles.length === 0 && <option value="rolling">當前月份</option>}
                                {cycles.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                                {cycles.length > 0 && <option value="rolling">自訂月份 (Rolling)</option>}
                            </select>
                        </div>

                        {selectedCycleId === 'rolling' && (
                            <input
                                type="month"
                                value={`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`}
                                onChange={(e) => setCurrentDate(new Date(e.target.value))}
                                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        )}

                        <button
                            onClick={handleExport}
                            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm shadow-teal-200"
                        >
                            <FileSpreadsheet size={16} /> 匯出 Excel
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden" id="stats-table">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">姓名</th>
                                    <th className="px-2 py-3 text-center bg-indigo-50/50 text-indigo-700">上班天數</th>
                                    <th className="px-2 py-3 text-center">現場天數</th>
                                    <th className="px-2 py-3 text-center text-fuchsia-600">遠班</th>
                                    <th className="px-2 py-3 text-center">北投天數</th>
                                    <th className="px-2 py-3 text-center text-blue-600">大直天數</th>
                                    <th className="px-2 py-3 text-center text-red-500 border-r border-slate-100">休假</th>

                                    <th className="px-2 py-3 text-center bg-red-50/30 text-red-800">場控</th>
                                    <th className="px-2 py-3 text-center bg-emerald-50/30 text-emerald-700">輔班</th>
                                    <th className="px-2 py-3 text-center">BMD/DX</th>
                                    <th className="px-2 py-3 text-center">CT</th>
                                    <th className="px-2 py-3 text-center">MR</th>
                                    <th className="px-2 py-3 text-center">US</th>
                                    <th className="px-2 py-3 text-center text-lime-700 border-r border-slate-100">技術支援</th>

                                    {/* New Stats Headers */}
                                    <th className="px-2 py-3 text-center bg-blue-50/30 text-blue-700">開機</th>
                                    <th className="px-2 py-3 text-center bg-amber-50/30 text-amber-700">晚班</th>
                                    <th className="px-2 py-3 text-center bg-red-50/30 text-red-700">排班</th>

                                    <th className="px-4 py-3 text-left">備註</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {statsData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-2.5 font-bold text-slate-800 sticky left-0 bg-white border-r border-slate-100">
                                            {row.name}
                                        </td>
                                        <td className="px-2 py-2.5 text-center font-bold text-indigo-700 bg-indigo-50/10">{row.totalWork}</td>
                                        <td className="px-2 py-2.5 text-center font-medium text-slate-700">{row.onSite}</td>
                                        <td className="px-2 py-2.5 text-center text-slate-500">{row.remote || '-'}</td>
                                        <td className="px-2 py-2.5 text-center text-slate-600">{row.beitou}</td>
                                        <td className="px-2 py-2.5 text-center text-blue-600">{row.dazhi || '-'}</td>
                                        <td className="px-2 py-2.5 text-center text-red-400 border-r border-slate-100 bg-red-50/5">{row.off}</td>

                                        <td className="px-2 py-2.5 text-center text-slate-600">{row.floorControl || '-'}</td>
                                        <td className="px-2 py-2.5 text-center text-emerald-600 font-bold">{row.assist || '-'}</td>
                                        <td className="px-2 py-2.5 text-center text-slate-500">{row.bmd || '-'}</td>
                                        <td className="px-2 py-2.5 text-center text-slate-500">{row.ct || '-'}</td>
                                        <td className="px-2 py-2.5 text-center text-slate-500">{row.mr || '-'}</td>
                                        <td className="px-2 py-2.5 text-center text-slate-500">{row.us || '-'}</td>
                                        <td className="px-2 py-2.5 text-center text-lime-700 border-r border-slate-100">{row.techSupport || '-'}</td>

                                        {/* New Stats Cells */}
                                        <td className="px-2 py-2.5 text-center text-blue-600 font-medium">{row.opening || '-'}</td>
                                        <td className="px-2 py-2.5 text-center text-amber-600 font-medium">{row.late || '-'}</td>
                                        <td className="px-2 py-2.5 text-center text-red-600 font-medium">{row.scheduler || '-'}</td>

                                        <td className="px-4 py-2.5 text-xs text-slate-400 italic">
                                            {row.remarks}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StatisticsPage;
