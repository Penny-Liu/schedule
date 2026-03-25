
import React, { useState, useMemo, useEffect } from 'react';
import { User, UserRole, SPECIAL_ROLES, StationDefault, DateEventType } from '../types';
import { db } from '../services/store';
import { BarChart3, Calendar, Filter, Download, FileSpreadsheet, Settings2, Save, FileText, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { utils, writeFile } from 'xlsx';

interface StatisticsPageProps {
    currentUser: User;
}

const StatisticsPage: React.FC<StatisticsPageProps> = ({ currentUser }) => {
    const cycles = db.getCycles();
    const [activeTab, setActiveTab] = useState<'stats' | 'cycles'>('stats');

    // ── Helper: build date array for a range (Robust to timezone) ──
    const buildDateRange = (startDate: string, endDate: string) => {
        const dates: string[] = [];
        const [sY, sM, sD] = startDate.split('-').map(Number);
        const [eY, eM, eD] = endDate.split('-').map(Number);
        const start = new Date(sY, sM - 1, sD);
        const end = new Date(eY, eM - 1, eD);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
        }
        return dates;
    };

    // ── Format date range for remarks (e.g. "3/8-4/6") ──
    const formatRangeShort = (startDate: string, endDate: string) => {
        const [, sm, sd] = startDate.split('-');
        const [, em, ed] = endDate.split('-');
        return `${parseInt(sm)}/${parseInt(sd)}-${parseInt(em)}/${parseInt(ed)}`;
    };

    // ── Personal Cycle helpers ──
    const calculateDays = (startDate?: string, endDate?: string) => {
        if (!startDate || !endDate) return 0;
        const [sY, sM, sD] = startDate.split('-').map(Number);
        const [eY, eM, eD] = endDate.split('-').map(Number);
        const start = new Date(sY, sM - 1, sD);
        const end = new Date(eY, eM - 1, eD);
        const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return diffDays > 0 ? diffDays : 0;
    };

    // ── Default dates for a month: prefer roster cycle that starts (or overlaps) this month ──
    const getDefaultDatesForMonth = (yearMonth: string) => {
        const [year, month] = yearMonth.split('-').map(Number);
        const monthStart = `${yearMonth}-01`;
        const lastDay = new Date(year, month, 0);
        const monthEnd = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

        // Prefer cycle that starts this month; fallback to one that overlaps
        const startsThis = cycles.find(c => c.startDate.startsWith(yearMonth));
        if (startsThis) return { startDate: startsThis.startDate, endDate: startsThis.endDate };

        const overlapping = cycles.find(c => c.startDate <= monthEnd && c.endDate >= monthStart);
        if (overlapping) return { startDate: overlapping.startDate, endDate: overlapping.endDate };

        // Final fallback: calendar month
        return { startDate: monthStart, endDate: monthEnd };
    };

    // Default to the current cycle (based on today) if found, otherwise first cycle (latest), otherwise 'rolling'
    const [selectedCycleId, setSelectedCycleId] = useState<string>(() => {
        const today = new Date().toISOString().split('T')[0];
        const activeCycle = cycles.find(c => today >= c.startDate && today <= c.endDate);
        if (activeCycle) return activeCycle.id;
        return cycles.length > 0 ? cycles[0].id : 'rolling';
    });
    const [currentDate, setCurrentDate] = useState(new Date());

    // Personal Cycle Tab state
    const [selectedMonth, setSelectedMonth] = useState<string>(() => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    });
    const [radiographers, setRadiographers] = useState<User[]>([]);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Sync radiographers with DB and handle updates
    useEffect(() => {
        const refreshData = () => {
            setRadiographers(db.getUsers().filter(u => u.isRadiographer === true && u.isActive !== false));
        };
        refreshData();
        return db.subscribe(refreshData);
    }, []);

    // 只統計有勾選為放射師的人員
    const users = db.getUsers().filter(u => u.isRadiographer === true);
    const shifts = db.getShifts('', '');
    const cloudSchedule = db.getCloudScheduleEntries();

    // ── Default dates for a month (already moved up) ──

    const cycleMonthKey = useMemo(() => {
        if (selectedCycleId === 'rolling') {
            return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        }
        const cycle = cycles.find(c => c.id === selectedCycleId);
        if (!cycle) return null;
        
        // If name is like '2026/02', use that as the month key ('2026-02') to match personalCycles
        if (cycle.name.match(/^\d{4}\/\d{2}$/)) {
            return cycle.name.replace('/', '-');
        }
        
        return cycle.startDate.slice(0, 7);
    }, [selectedCycleId, currentDate, cycles]);

    // ── Determine Date Range (for header display / default) ──
    const dateRange = useMemo(() => {
        if (selectedCycleId !== 'rolling') {
            const cycle = cycles.find(c => c.id === selectedCycleId);
            if (cycle) {
                return buildDateRange(cycle.startDate, cycle.endDate);
            }
        }
        const start = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
        return buildDateRange(start, end);
    }, [currentDate, selectedCycleId, cycles]);



    // ── Calculations ──
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
                remarks: '',
                floorControl: 0,
                assist: 0,
                opening: 0,
                late: 0,
                scheduler: 0,
                bmd: 0,
                ct: 0,
                mr: 0,
                us: 0,
                techSupport: 0,
                proofreader: 0,
            };

            // Determine effective date range for this user
            let effectiveRange = dateRange;
            if (cycleMonthKey) {
                const saved = user.personalCycles?.[cycleMonthKey];
                const defaults = getDefaultDatesForMonth(cycleMonthKey);
                
                // Always use saved cycle if it exists to pick up memos even if dates are default
                if (saved) {
                    effectiveRange = buildDateRange(saved.startDate, saved.endDate);
                    // Use custom memo if available, otherwise show the date range as fallback
                    stats.remarks = saved.memo || formatRangeShort(saved.startDate, saved.endDate);
                }
            }

            effectiveRange.forEach(dateStr => {
                // Cloud Proofreading count should be independent of OFF status
                const cloudShifts = cloudSchedule.filter(cs => {
                    return cs.date === dateStr && cs.proofreaderUserId === user.id;
                });
                stats.proofreader += cloudShifts.length;

                const status = db.getUserStatusOnDate(user.id, dateStr);
                if (status === 'OFF') { stats.off++; return; }

                let station = StationDefault.UNASSIGNED as string;
                let roles: string[] = [];

                const manualShift = shifts.find(s => s.userId === user.id && s.date === dateStr);
                if (manualShift) { station = manualShift.station; roles = manualShift.specialRoles || []; }

                stats.totalWork++;

                if (station.includes('遠')) stats.remote++;
                else if (station.includes('大直')) stats.dazhi++;
                else stats.beitou++;

                if (station.includes('場控')) stats.floorControl++;
                if (station.includes('BMD') || station.includes('DX')) stats.bmd++;
                if (station.includes('CT')) stats.ct++;
                if (station.includes('MR')) stats.mr++;
                if (station.includes('US')) stats.us++;
                if (station.includes('技術支援')) stats.techSupport++;

                if (roles.includes(SPECIAL_ROLES.ASSIST)) stats.assist++;
                if (roles.includes(SPECIAL_ROLES.OPENING)) stats.opening++;
                if (roles.includes(SPECIAL_ROLES.LATE)) stats.late++;
                if (roles.includes(SPECIAL_ROLES.SCHEDULER)) stats.scheduler++;

            });

            stats.onSite = stats.totalWork - stats.remote;
            return stats;
        });
    }, [users, dateRange, shifts, cloudSchedule, cycleMonthKey]);

    // ── Personal Cycle helpers (already moved up) ──

    const handleCycleChange = (userId: string, field: 'startDate' | 'endDate' | 'memo', value: string) => {
        setRadiographers(prev => prev.map(u => {
            if (u.id === userId) {
                const currentCycles = u.personalCycles || {};
                const currentMonthData = currentCycles[selectedMonth] || { ...getDefaultDatesForMonth(selectedMonth), memo: '' };
                return { ...u, personalCycles: { ...currentCycles, [selectedMonth]: { ...currentMonthData, [field]: value } } };
            }
            return u;
        }));
    };

    const handleSaveCycle = async (user: User) => {
        setSavingId(user.id);
        setSaveError(null);
        try {
            await db.updateUser(user.id, { personalCycles: user.personalCycles });
        } catch (err: any) {
            setSaveError(`儲存失敗: ${err.message || '未知錯誤'}`);
        } finally {
            setTimeout(() => setSavingId(null), 500);
        }
    };

    const handlePrevMonth = () => {
        const [year, month] = selectedMonth.split('-').map(Number);
        let py = year, pm = month - 1;
        if (pm === 0) { pm = 12; py--; }
        setSelectedMonth(`${py}-${String(pm).padStart(2, '0')}`);
    };

    const handleNextMonth = () => {
        const [year, month] = selectedMonth.split('-').map(Number);
        let ny = year, nm = month + 1;
        if (nm === 13) { nm = 1; ny++; }
        setSelectedMonth(`${ny}-${String(nm).padStart(2, '0')}`);
    };

    // ── Export Excel ──
    const handleExport = () => {
        try {
            const excelData = statsData.map(row => ({
                "姓名": row.name,
                "上班天數": row.totalWork,
                "現場天數": row.onSite,
                "遠班": row.remote,
                "北投天數": row.beitou,
                "大直天數": row.dazhi,
                "休假": row.off,
                "備註": row.remarks,
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
                "校對": row.proofreader,
            }));

            const ws = utils.json_to_sheet(excelData);
            const wscols = [
                { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
                { wch: 12 }, // 備註
                { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
                { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
            ];
            ws['!cols'] = wscols;

            const wb = utils.book_new();
            utils.book_append_sheet(wb, ws, "工作統計");
            const fileName = `工作統計_${selectedCycleId === 'rolling' ? currentDate.toISOString().slice(0, 7) : '週期報表'}.xlsx`;
            writeFile(wb, fileName);
        } catch (e) {
            console.error("Excel export failed", e);
            alert('匯出 Excel 失敗，請稍後再試');
        }
    };

    const cycleName = selectedCycleId === 'rolling'
        ? `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月 (自動範圍)`
        : cycles.find(c => c.id === selectedCycleId)?.name;

    const [displayYear, displayMonth] = selectedMonth.split('-');
    const displayMonthStr = `${displayYear} 年 ${parseInt(displayMonth, 10)} 月`;

    const isSupervisorOrAdmin = currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN;

    return (
        <div className="h-full flex flex-col bg-slate-50">
            {/* Header */}
            <div className="flex-none px-6 py-4 bg-white border-b border-slate-200 shadow-sm z-10">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><BarChart3 size={20} /></div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">工作狀況統計</h2>
                            <p className="text-xs text-slate-500 font-medium">
                                {activeTab === 'stats'
                                    ? `統計範圍: ${cycleName}${dateRange.length > 0 ? ` (${dateRange[0]} ~ ${dateRange[dateRange.length - 1]})` : ''}`
                                    : `個人週期微調 — ${displayMonthStr}`
                                }
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Tab Switcher */}
                        <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                            <button
                                onClick={() => setActiveTab('stats')}
                                className={`px-3 py-1.5 rounded text-sm font-bold transition-all ${activeTab === 'stats' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <BarChart3 size={14} className="inline mr-1" />統計表
                            </button>
                            {isSupervisorOrAdmin && (
                                <button
                                    onClick={() => setActiveTab('cycles')}
                                    className={`px-3 py-1.5 rounded text-sm font-bold transition-all ${activeTab === 'cycles' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <Settings2 size={14} className="inline mr-1" />個人週期
                                </button>
                            )}
                        </div>

                        {activeTab === 'stats' && (
                            <>
                                <div className="flex items-center bg-slate-50 hover:bg-slate-100 rounded-lg px-2 py-1.5 transition-colors border border-slate-200">
                                    <Filter size={14} className="text-slate-500 mr-2" />
                                    <select
                                        value={selectedCycleId}
                                        onChange={(e) => setSelectedCycleId(e.target.value)}
                                        className="text-sm bg-transparent border-none focus:ring-0 text-slate-700 font-medium cursor-pointer py-0 pl-0 pr-8"
                                    >
                                        {cycles.length === 0 && <option value="rolling">當前月份</option>}
                                        {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                            </>
                        )}

                        {activeTab === 'cycles' && (
                            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200">
                                <button onClick={handlePrevMonth} className="p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors">
                                    <ChevronLeft size={18} />
                                </button>
                                <div className="font-bold text-gray-700 min-w-[100px] text-center">{displayMonthStr}</div>
                                <button onClick={handleNextMonth} className="p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors">
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-6">

                {/* ── Stats Tab ── */}
                {activeTab === 'stats' && (
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
                                        <th className="px-2 py-3 text-center text-red-500">休假</th>
                                        <th className="px-2 py-3 text-center text-amber-600 border-r border-slate-100">備註</th>
                                        <th className="px-2 py-3 text-center bg-red-50/30 text-red-800">場控</th>
                                        <th className="px-2 py-3 text-center bg-emerald-50/30 text-emerald-700">輔班</th>
                                        <th className="px-2 py-3 text-center">BMD/DX</th>
                                        <th className="px-2 py-3 text-center">CT</th>
                                        <th className="px-2 py-3 text-center">MR</th>
                                        <th className="px-2 py-3 text-center">US</th>
                                        <th className="px-2 py-3 text-center text-lime-700 border-r border-slate-100">技術支援</th>
                                        <th className="px-2 py-3 text-center bg-blue-50/30 text-blue-700">開機</th>
                                        <th className="px-2 py-3 text-center bg-amber-50/30 text-amber-700">晚班</th>
                                        <th className="px-2 py-3 text-center bg-red-50/30 text-red-700">排班</th>
                                        <th className="px-2 py-3 text-center bg-purple-50/30 text-purple-700">校對</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {statsData.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-2.5 font-bold text-slate-800 sticky left-0 bg-white border-r border-slate-100">{row.name}</td>
                                            <td className="px-2 py-2.5 text-center font-bold text-indigo-700 bg-indigo-50/10">{row.totalWork}</td>
                                            <td className="px-2 py-2.5 text-center font-medium text-slate-700">{row.onSite}</td>
                                            <td className="px-2 py-2.5 text-center text-slate-500">{row.remote || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-slate-600">{row.beitou}</td>
                                            <td className="px-2 py-2.5 text-center text-blue-600">{row.dazhi || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-red-400 bg-red-50/5">{row.off}</td>
                                            <td className="px-2 py-2.5 text-center text-amber-600 border-r border-slate-100 text-xs font-semibold">{row.remarks || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-slate-600">{row.floorControl || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-emerald-600 font-bold">{row.assist || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-slate-500">{row.bmd || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-slate-500">{row.ct || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-slate-500">{row.mr || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-slate-500">{row.us || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-lime-700 border-r border-slate-100">{row.techSupport || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-blue-600 font-medium">{row.opening || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-amber-600 font-medium">{row.late || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-red-600 font-medium">{row.scheduler || '-'}</td>
                                            <td className="px-2 py-2.5 text-center text-purple-600 font-medium">{row.proofreader || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── Personal Cycles Tab ── */}
                {activeTab === 'cycles' && isSupervisorOrAdmin && (
                    <div className="max-w-6xl mx-auto flex flex-col gap-4">
                        <p className="text-sm text-gray-500">
                            設定每位放射師在選定月份的工作週期起訖日期與備忘。預設使用該月份對應的排班週期；有微調的人員會以琥珀色標示。
                        </p>

                        {saveError && (
                            <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 border border-red-100">
                                <AlertCircle className="shrink-0 mt-0.5" size={18} />
                                <p className="text-sm">{saveError}</p>
                            </div>
                        )}

                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[800px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                                            <th className="px-6 py-4 font-bold w-[18%]">放射師姓名</th>
                                            <th className="px-6 py-4 font-bold w-[35%]">本月週期範圍</th>
                                            <th className="px-6 py-4 font-bold w-[22%]">備忘</th>
                                            <th className="px-6 py-4 font-bold text-center w-[12%]">當期天數</th>
                                            <th className="px-6 py-4 font-bold text-center w-[13%]">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {radiographers.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                                                    目前沒有放射師資料。
                                                </td>
                                            </tr>
                                        ) : (
                                            radiographers.map(user => {
                                                const defaultDates = getDefaultDatesForMonth(selectedMonth);
                                                const savedCycle = user.personalCycles?.[selectedMonth];
                                                const currentMonthData = savedCycle || { ...defaultDates, memo: '' };
                                                const isCustomized = !!savedCycle && (
                                                    savedCycle.startDate !== defaultDates.startDate ||
                                                    savedCycle.endDate !== defaultDates.endDate
                                                );
                                                const currentDays = calculateDays(currentMonthData.startDate, currentMonthData.endDate);

                                                return (
                                                    <tr
                                                        key={user.id}
                                                        className={`transition-colors ${isCustomized ? 'bg-amber-50 hover:bg-amber-100/60 border-l-4 border-amber-400' : 'hover:bg-slate-50/50'}`}
                                                    >
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div
                                                                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-sm shrink-0"
                                                                    style={{ backgroundColor: user.color || '#9CA3AF' }}
                                                                >
                                                                    {user.alias || user.name[0]}
                                                                </div>
                                                                <div className="font-bold text-gray-800 text-sm">{user.name}</div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                <div className="relative flex-1">
                                                                    <Calendar size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                                                                    <input
                                                                        type="date"
                                                                        value={currentMonthData.startDate}
                                                                        onChange={(e) => handleCycleChange(user.id, 'startDate', e.target.value)}
                                                                        className="w-full pl-8 pr-1 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none"
                                                                    />
                                                                </div>
                                                                <span className="text-gray-400 font-bold shrink-0">~</span>
                                                                <div className="relative flex-1">
                                                                    <Calendar size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                                                                    <input
                                                                        type="date"
                                                                        value={currentMonthData.endDate}
                                                                        onChange={(e) => handleCycleChange(user.id, 'endDate', e.target.value)}
                                                                        className="w-full pl-8 pr-1 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="relative">
                                                                <FileText size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                                                                <input
                                                                    type="text"
                                                                    placeholder="備忘..."
                                                                    value={currentMonthData.memo}
                                                                    onChange={(e) => handleCycleChange(user.id, 'memo', e.target.value)}
                                                                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none"
                                                                />
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 font-bold rounded-lg border text-sm ${isCustomized ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                                                {currentDays} 天
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <button
                                                                onClick={() => handleSaveCycle(user)}
                                                                disabled={savingId === user.id}
                                                                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold transition-all w-20 mx-auto ${
                                                                    savingId === user.id
                                                                        ? 'bg-green-100 text-green-700 pointer-events-none'
                                                                        : 'bg-teal-600 text-white hover:bg-teal-700 active:scale-95 shadow-sm shadow-teal-200'
                                                                }`}
                                                            >
                                                                {savingId === user.id ? '已儲存' : <><Save size={14} /> 儲存</>}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StatisticsPage;
