
import React, { useState, useMemo } from 'react';
import { User, UserRole, RosterCycle, SYSTEM_OFF, StationDefault, Holiday, DateEventType, CycleAnchor } from '../types';
import { db } from '../services/store';
import { Plus, Trash2, Save, Settings, Calendar, AlertCircle, Users, Clock, Globe, X, RefreshCw, Key, UserCircle, ChevronDown, CalendarPlus } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

interface SettingsPageProps {
    currentUser: User;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ currentUser }) => {
    const [stations, setStations] = useState<string[]>(db.getStations());
    const [requirements, setRequirements] = useState<Record<string, number[]>>(db.getStationRequirements());
    // Force Update: 2026-01-14
    const [cycles, setCycles] = useState<RosterCycle[]>(db.getCycles());
    const [holidays, setHolidays] = useState<Holiday[]>(db.getHolidays());

    // Input states
    const [newStation, setNewStation] = useState('');
    const [newCycle, setNewCycle] = useState<Partial<RosterCycle>>({ name: '', startDate: '', endDate: '' });
    const [newHoliday, setNewHoliday] = useState<Partial<Holiday>>({ date: '', name: '', type: DateEventType.NATIONAL });
    const [cycleStartDate, setCycleStartDate] = useState(db.getCycleStartDate());
    const [anchors, setAnchors] = useState<CycleAnchor[]>(db.getCycleAnchors());

    const [newAnchor, setNewAnchor] = useState({ effective: '', anchor: '' });

    // Password Change State
    const [passwordData, setPasswordData] = useState({ old: '', new: '', confirm: '' });

    // Batch Generate State
    const [batchConfig, setBatchConfig] = useState({
        nth: '3', // 1, 2, 3, 4, last
        weekday: '5', // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
        startMonth: new Date().toISOString().slice(0, 7),
        endMonth: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 7),
        name: '科會',
        type: DateEventType.NOTE,
        frequency: '1' // Default every 1 month
    });

    const [lineTemplate, setLineTemplate] = useState(db.settings.lineCopyTemplate || '');



    // Confirm Modal State
    const [confirmState, setConfirmState] = useState<{
        type: 'station' | 'cycle' | 'holiday';
        id: string; // stationName, cycleId, or holidayDate
        title: string;
        message: string;
    } | null>(null);

    const isSupervisorOrAdmin = currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN;
    const isSystemAdmin = currentUser.role === UserRole.SYSTEM_ADMIN;

    // Calculate duration helper
    const cycleDuration = useMemo(() => {
        if (!newCycle.startDate || !newCycle.endDate) return 0;
        const start = new Date(newCycle.startDate);
        const end = new Date(newCycle.endDate);
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return diffDays > 0 ? diffDays : 0;
    }, [newCycle.startDate, newCycle.endDate]);

    // Station Handlers
    const handleAddStation = (e: React.FormEvent) => {
        e.preventDefault();
        if (newStation && !stations.includes(newStation) && newStation !== SYSTEM_OFF) {
            db.addStation(newStation);
            setStations(db.getStations());
            setRequirements(db.getStationRequirements());
            setNewStation('');
        }
    };

    const handleDeleteStationClick = (name: string) => {
        setConfirmState({
            type: 'station',
            id: name,
            title: '刪除崗位確認',
            message: `確定要刪除崗位 "${name}" 嗎？此操作將同時移除該崗位的所有人力需求設定。`
        });
    };

    const handleRequirementChange = (station: string, dayIndex: number, count: number) => {
        if (count < 0) return;
        db.updateStationRequirement(station, dayIndex, count);
        setRequirements({ ...db.getStationRequirements() });
    };

    // Cycle Anchor Handlers
    const handleAddAnchor = async () => {
        if (newAnchor.effective && newAnchor.anchor) {
            try {
                await db.addCycleAnchor(newAnchor.effective, newAnchor.anchor);
                setAnchors(db.getCycleAnchors()); // Refresh list
                setNewAnchor({ effective: '', anchor: '' });
            } catch (error: any) {
                alert('儲存重置點失敗: ' + (error.message || '未知錯誤'));
                console.error('Save failed', error);
            }
        } else {
            alert('請輸入完整的生效日期與基準日');
        }
    };

    const handleRemoveAnchor = async (effectiveDate: string) => {
        if (confirm('確定要刪除此重置點嗎？')) {
            try {
                await db.removeCycleAnchor(effectiveDate);
                setAnchors(db.getCycleAnchors());
            } catch (error: any) {
                alert('刪除失敗: ' + (error.message || '未知錯誤'));
            }
        }
    };

    // Cycle Handlers
    const handleAddCycle = (e: React.FormEvent) => {
        e.preventDefault();
        if (newCycle.name && newCycle.startDate && newCycle.endDate) {
            if (newCycle.startDate > newCycle.endDate!) {
                alert('結束日期不能早於開始日期');
                return;
            }

            const cycle: RosterCycle = {
                id: Math.random().toString(36).substr(2, 9),
                name: newCycle.name,
                startDate: newCycle.startDate,
                endDate: newCycle.endDate
            };

            db.addCycle(cycle);
            setCycles(db.getCycles());
            setNewCycle({ name: '', startDate: '', endDate: '' });
        }
    };

    const handleDeleteCycleClick = (id: string) => {
        setConfirmState({
            type: 'cycle',
            id: id,
            title: '刪除週期確認',
            message: '確定要刪除此排班週期嗎？'
        });
    };

    const handleUpdateCycleStartDate = () => {
        db.updateCycleStartDate(cycleStartDate);
        alert('已更新排班循環基準日！儀表板的四休二邏輯將依此日期重新計算。');
    };

    // Holiday Handlers
    const handleImportHolidays = () => {
        const count = db.importTaiwanHolidays();
        setHolidays(db.getHolidays());
        alert(`已成功匯入 ${count} 個台灣國定假日 (從今日起)`);
    };

    const handleAddHoliday = (e: React.FormEvent) => {
        e.preventDefault();
        if (newHoliday.date && newHoliday.name && newHoliday.type) {
            db.addHoliday(newHoliday as Holiday);
            setHolidays(db.getHolidays());
            setNewHoliday({ date: '', name: '', type: DateEventType.NATIONAL });
        }
    };

    const handleDeleteHolidayClick = (date: string) => {
        // Small actions don't always need complex confirmation, but keeping consistent
        setConfirmState({
            type: 'holiday',
            id: date,
            title: '移除特殊日期',
            message: `確定要移除 ${date} 的設定嗎？`
        });
    };





    const handleBatchGenerate = (e: React.FormEvent) => {
        e.preventDefault();
        const start = new Date(batchConfig.startMonth + '-01');
        const end = new Date(batchConfig.endMonth + '-01');

        if (start > end) {
            alert('結束月份不能早於開始月份');
            return;
        }

        const generatedDates: Holiday[] = [];
        let current = new Date(start);

        // Iterate through months
        while (current <= end) {
            const year = current.getFullYear();
            const month = current.getMonth(); // 0-11

            const targetWeekday = parseInt(batchConfig.weekday); // 0-6

            let dateFound = 0;

            if (batchConfig.nth === 'last') {
                // Find Last Weekday
                // Go to next month day 0 (last day of this month)
                const lastDay = new Date(year, month + 1, 0);
                // Backtrack until we find the weekday
                for (let d = lastDay.getDate(); d >= 1; d--) {
                    const checkDate = new Date(year, month, d);
                    if (checkDate.getDay() === targetWeekday) {
                        dateFound = d;
                        break;
                    }
                }
            } else {
                // Find Nth Weekday
                const nth = parseInt(batchConfig.nth);
                let count = 0;
                // Loop from day 1
                for (let d = 1; d <= 31; d++) {
                    const checkDate = new Date(year, month, d);
                    if (checkDate.getMonth() !== month) break; // Overflow check

                    if (checkDate.getDay() === targetWeekday) {
                        count++;
                        if (count === nth) {
                            dateFound = d;
                            break;
                        }
                    }
                }
            }

            if (dateFound > 0) {
                // Construct YYYY-MM-DD
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dateFound).padStart(2, '0')}`;
                generatedDates.push({
                    date: dateStr,
                    name: batchConfig.name,
                    type: batchConfig.type
                });
            }

            // Next month logic with frequency
            current.setMonth(current.getMonth() + parseInt(batchConfig.frequency));
        }

        if (generatedDates.length > 0) {
            if (confirm(`即將產生 ${generatedDates.length} 筆資料:\n${generatedDates.map(d => d.date).join(', ')}\n\n確定新增嗎？`)) {
                generatedDates.forEach(h => db.addHoliday(h));
                setHolidays(db.getHolidays());
                alert('批次新增完成！');
            }
        } else {
            alert('此區間內找不到符合規則的日期。');
        }
    };

    // Unified Confirm Handler
    const handleConfirmAction = () => {
        if (!confirmState) return;

        if (confirmState.type === 'station') {
            db.removeStation(confirmState.id);
            setStations(db.getStations());
            setRequirements(db.getStationRequirements());
        } else if (confirmState.type === 'cycle') {
            db.deleteCycle(confirmState.id);
            setCycles(db.getCycles());
        } else if (confirmState.type === 'holiday') {
            db.removeHoliday(confirmState.id);
            setHolidays(db.getHolidays());
        }
        setConfirmState(null);
    };

    // Password Handler
    const handleChangePassword = (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordData.new !== passwordData.confirm) {
            alert('新密碼與確認密碼不符');
            return;
        }
        const currentStoredPass = currentUser.password || '1234';
        if (passwordData.old !== currentStoredPass) {
            alert('舊密碼錯誤');
            return;
        }

        db.changePassword(currentUser.id, passwordData.new);
        alert('密碼已成功修改，下次請使用新密碼登入。');
        setPasswordData({ old: '', new: '', confirm: '' });
    };

    // Format cycle name for display in list
    const formatCycleName = (name: string) => {
        // Regex to match "YYYY/MM" or "YYYY/M"
        const match = name.match(/^(\d{4})\/(\d{1,2})$/);
        if (match) {
            return `${match[1]}年第${match[2]}週期`;
        }
        return name;
    };

    const getEventTypeLabel = (type: DateEventType) => {
        switch (type) {
            case DateEventType.NATIONAL: return '國定假日';
            case DateEventType.MEETING: return '備忘'; // Unify Legacy Meeting as Memo
            case DateEventType.NOTE: return '備忘';
            case DateEventType.CLOSED: return '休診';
            default: return type;
        }
    };

    const getEventTypeColor = (type: DateEventType) => {
        switch (type) {
            case DateEventType.NATIONAL: return 'text-red-600 bg-red-100';
            case DateEventType.MEETING: return 'text-blue-600 bg-blue-100'; // Unify Legacy Meeting as Blue
            case DateEventType.NOTE: return 'text-blue-600 bg-blue-100';
            case DateEventType.CLOSED: return 'text-gray-600 bg-gray-200 border-gray-300';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

    // Filter out stations that shouldn't have quantity settings (OFF and UNASSIGNED)
    const displayStations = stations.filter(s => s !== SYSTEM_OFF && s !== StationDefault.UNASSIGNED);

    return (
        <div className="p-6 max-w-7xl mx-auto h-screen overflow-y-auto">
            <ConfirmModal
                isOpen={!!confirmState}
                onClose={() => setConfirmState(null)}
                onConfirm={handleConfirmAction}
                title={confirmState?.title || ''}
                message={confirmState?.message || ''}
                confirmColor="red"
                confirmText="確定刪除"
            />

            <div className="mb-6 flex items-center gap-3">
                <div className="p-2.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <Settings className="text-teal-600" size={24} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-gray-800">系統與個人設定</h2>
                    <p className="text-sm text-gray-500">修改密碼、管理排班週期與崗位需求</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* Personal Settings (Available to ALL) */}
                <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <UserCircle size={16} className="text-teal-600" />
                            個人帳戶設定
                        </h3>
                    </div>
                    <div className="p-6">
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-500 mb-1 block">舊密碼</label>
                                <input
                                    type="password"
                                    value={passwordData.old}
                                    onChange={(e) => setPasswordData({ ...passwordData, old: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                    placeholder="請輸入目前密碼"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 mb-1 block">新密碼</label>
                                    <input
                                        type="password"
                                        value={passwordData.new}
                                        onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                        placeholder="請輸入新密碼"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 mb-1 block">確認新密碼</label>
                                    <input
                                        type="password"
                                        value={passwordData.confirm}
                                        onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                        placeholder="再次輸入新密碼"
                                        required
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-lg transition-colors text-sm flex justify-center items-center gap-2 shadow-sm shadow-teal-200"
                            >
                                <Key size={16} /> 修改密碼
                            </button>
                        </form>
                    </div>
                </div>

                {/* --- SYSTEM SETTINGS (ADMIN ONLY) --- */}
                {isSupervisorOrAdmin && (
                    <>
                        {/* Cycle Calculation Settings - SYSTEM ADMIN ONLY */}
                        {isSystemAdmin && (
                            <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                        <RefreshCw size={16} className="text-gray-400" />
                                        排班邏輯設定 (系統管理員專用)
                                    </h3>
                                </div>
                                <div className="p-6">
                                    <div className="space-y-4">
                                        {/* Global Default (Legacy/Base) */}
                                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                                            <label className="text-xs font-bold text-gray-500 mb-2 block">全域預設循環基準日 (最初始設定)</label>
                                            <div className="flex gap-2 items-center">
                                                <input
                                                    type="date"
                                                    value={cycleStartDate}
                                                    onChange={(e) => setCycleStartDate(e.target.value)}
                                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm"
                                                />
                                                <button
                                                    onClick={handleUpdateCycleStartDate}
                                                    className="bg-gray-800 hover:bg-gray-900 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-sm whitespace-nowrap"
                                                >
                                                    更新預設
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1">
                                                這是系統最底層的預設值 (通常設為 2024/1/1 或 2025/11/6)。若沒有任何「重置點」覆蓋，將使用此日期計算。
                                            </p>
                                        </div>

                                        <div className="border-t border-gray-100 my-2"></div>

                                        {/* Dynamic Anchors */}
                                        <div>
                                            <div className="mb-3">
                                                <h4 className="font-bold text-gray-700 text-sm mb-1">排班重置點 (Cycle Anchors)</h4>
                                                <p className="text-xs text-gray-500">
                                                    設定新的「生效日期」，系統將從該日起，改以新的「循環基準日」重新計算四休二邏輯，不影響生效日之前的歷史排班。
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded border border-slate-200 mb-3">
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 mb-1 block">生效日期 (從這天起)</label>
                                                    <input
                                                        type="date"
                                                        className="w-full text-sm border border-slate-300 rounded px-2 py-1"
                                                        value={newAnchor.effective}
                                                        onChange={e => setNewAnchor({ ...newAnchor, effective: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 mb-1 block">新的循環基準日 (Day 1)</label>
                                                    <input
                                                        type="date"
                                                        className="w-full text-sm border border-slate-300 rounded px-2 py-1"
                                                        value={newAnchor.anchor}
                                                        onChange={e => setNewAnchor({ ...newAnchor, anchor: e.target.value })}
                                                    />
                                                </div>
                                                <button
                                                    onClick={handleAddAnchor}
                                                    className="col-span-2 mt-1 bg-teal-600 text-white text-xs font-bold py-1.5 rounded hover:bg-teal-700 transition-colors flex items-center justify-center gap-1"
                                                >
                                                    <Plus size={14} /> 新增重置點
                                                </button>
                                            </div>

                                            <div className="border rounded-lg overflow-hidden">
                                                <table className="w-full text-sm text-left">
                                                    <thead className="bg-slate-100 text-slate-500 font-bold text-xs">
                                                        <tr>
                                                            <th className="px-3 py-2">生效日期</th>
                                                            <th className="px-3 py-2">新基準日</th>
                                                            <th className="px-3 py-2 text-right">操作</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {anchors.map((anchor, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-50">
                                                                <td className="px-3 py-2 font-mono text-slate-700">{anchor.effectiveDate}</td>
                                                                <td className="px-3 py-2 font-mono text-slate-700">{anchor.anchorDate}</td>
                                                                <td className="px-3 py-2 text-right">
                                                                    <button
                                                                        onClick={() => handleRemoveAnchor(anchor.effectiveDate)}
                                                                        className="text-red-400 hover:text-red-600 p-1"
                                                                        title="刪除"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        {anchors.length === 0 && (
                                                            <tr>
                                                                <td colSpan={3} className="px-3 py-4 text-center text-slate-400 text-xs italic">
                                                                    目前沒有重置點，全期使用預設基準。
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                        }

                        {/* Database Maintenance Tool (Available to Supervisor/Admin) */}
                        <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                            <div className="px-6 py-4 border-b border-gray-100 bg-orange-50/50">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <AlertCircle size={16} className="text-orange-500" />
                                    資料庫維護 (異常修復)
                                </h3>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-gray-600 mb-4">
                                    若發生「排班儲存後跳回未指派」或「資料無法寫入」狀況，可能是因為舊系統產生了重複資料。
                                    請點擊下方按鈕進行資料庫清理。
                                </p>
                                <button
                                    onClick={async () => {
                                        if (confirm('確定要執行資料庫清理嗎？這將掃描所有排班並移除重複的無效資料。')) {
                                            try {
                                                const count = await db.cleanupDuplicateShifts();
                                                alert(`清理完成！共移除了 ${count} 筆重複資料。`);
                                            } catch (e) {
                                                alert('清理失敗，請查看 Console');
                                            }
                                        }
                                    }}
                                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-lg transition-colors text-sm flex justify-center items-center gap-2 shadow-sm shadow-orange-200"
                                >
                                    <RefreshCw size={16} /> 掃描並修復重複資料
                                </button>

                                <div className="mt-6 pt-6 border-t border-gray-100">
                                    <h4 className="font-bold text-red-600 text-sm mb-2 flex items-center gap-1">
                                        <Trash2 size={14} /> 強制清除特定月份資料 (核彈選項)
                                    </h4>
                                    <p className="text-xs text-gray-500 mb-3">
                                        如果上述掃描無效 (顯示 0 筆)，且該月份仍然無法寫入/一直跳回未指派，請使用此功能。
                                        <br />
                                        <span className="font-bold text-red-500">警告：這將刪除該月份「所有」排班紀錄，請謹慎使用。</span>
                                    </p>
                                    <div className="flex gap-2">
                                        <input
                                            type="month"
                                            id="forceCleanMonth"
                                            className="border border-gray-300 rounded px-2 text-sm"
                                        />
                                        <button
                                            onClick={async () => {
                                                const monthInput = document.getElementById('forceCleanMonth') as HTMLInputElement;
                                                const yearMonth = monthInput.value;
                                                if (!yearMonth) {
                                                    alert('請先選擇要清除的月份');
                                                    return;
                                                }

                                                const confirmMsg = `【嚴重警告】\n\n您即將刪除 ${yearMonth} 的「所有」排班資料。\n\n這將無法復原！\n\n確定要繼續嗎？`;
                                                if (confirm(confirmMsg)) {
                                                    if (confirm('再次確認：這真的會刪光該月資料，您確定嗎？')) {
                                                        try {
                                                            await db.forceClearMonth(yearMonth);
                                                            alert(`${yearMonth} 資料已強制清空。請重新進行排班。`);
                                                        } catch (e) {
                                                            alert('清除失敗，請查看 Console');
                                                        }
                                                    }
                                                }
                                            }}
                                            className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-4 py-2 rounded-lg text-sm transition-colors border border-red-200"
                                        >
                                            強制重置該月
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>


                        {/* Line Copy Template Settings */}
                        <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <Clock size={16} className="text-gray-400" />
                                    Line 複製格式設定 (系統管理員專用)
                                </h3>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-gray-500 mb-2">
                                    您可以自訂「複製文字」的內容格式。請使用下方的變數代碼進行排版，系統會自動帶入當日資料。
                                </p>
                                <textarea
                                    className="w-full h-64 p-3 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 outline-none resize-y mb-2"
                                    value={lineTemplate}
                                    onChange={(e) => setLineTemplate(e.target.value)}
                                    placeholder="請輸入格式範本..."
                                />
                                <div className="flex gap-2 mb-4">
                                    <button
                                        onClick={() => {
                                            db.settings.lineCopyTemplate = lineTemplate;
                                            db.saveSettings();
                                            alert('格式已儲存！');
                                        }}
                                        className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                                    >
                                        <Save size={16} /> 儲存設定
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (confirm('確定要回復成系統預設格式嗎？您的修改將會遺失。')) {
                                                const defaultTemplate = `{{date}}
{{imaging_doctors}}

放射師人力
北投 {{beitou_count}}  (客戶：{{beitou_clients}}  CTA  {{beitou_cta}})
BU領頭 場控：{{floor_control}}
MR : {{mr}}
US：{{us}}
CT: {{ct}}
BMD :{{bmd}}
支援  :{{support}}

遠群（{{remote_group}}）
{{remote_doctors_detail}}
遠：{{remote_radiographers}}

大直 {{dazhi_count}} （客戶 {{dazhi_clients}} ）
{{dazhi_radiographers}}

三線支援：{{third_line_support}}`;
                                                setLineTemplate(defaultTemplate);
                                                db.settings.lineCopyTemplate = defaultTemplate;
                                                db.saveSettings();
                                                alert('已回復預設值');
                                            }
                                        }}
                                        className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-bold"
                                    >
                                        回復預設值
                                    </button>
                                </div>

                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <h4 className="text-xs font-bold text-slate-500 mb-2">可用變數代碼 (點擊複製)</h4>
                                    <div className="flex flex-wrap gap-2 text-xs font-mono text-slate-700">
                                        {[
                                            '{{date}}', '{{imaging_doctors}}',
                                            '{{beitou_count}}',
                                            '{{beitou_clients}}', '{{beitou_cta}}',
                                            '{{floor_control}}', '{{mr}}', '{{us}}', '{{ct}}', '{{bmd}}', '{{support}}',
                                            '{{remote_group}}', '{{remote_doctors_detail}}', '{{remote_radiographers}}',
                                            '{{dazhi_count}}', '{{dazhi_clients}}', '{{dazhi_radiographers}}',
                                            '{{third_line_support}}'
                                        ].map(v => (
                                            <button
                                                key={v}
                                                onClick={() => {
                                                    navigator.clipboard.writeText(v);
                                                    alert(`已複製 ${v}`);
                                                }}
                                                className="bg-white border border-slate-300 px-2 py-1 rounded hover:bg-slate-100 transition"
                                            >
                                                {v}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Cycle Management */}
                        <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <Calendar size={16} className="text-gray-400" />
                                    排班週期 (主管專用)
                                </h3>
                            </div>

                            <div className="p-6 border-b border-gray-100">
                                <form onSubmit={handleAddCycle} className="space-y-4">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 mb-1 block">週期名稱 (格式建議: YYYY/NN)</label>
                                        <input
                                            type="text"
                                            value={newCycle.name}
                                            onChange={(e) => setNewCycle({ ...newCycle, name: e.target.value })}
                                            placeholder="例：2025/12"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                                            required
                                        />
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="flex-1">
                                            <label className="text-xs font-semibold text-gray-500 mb-1 block">開始日期</label>
                                            <input
                                                type="date"
                                                value={newCycle.startDate}
                                                onChange={(e) => setNewCycle({ ...newCycle, startDate: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                                                required
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-xs font-semibold text-gray-500 mb-1 block">結束日期</label>
                                            <input
                                                type="date"
                                                value={newCycle.endDate}
                                                onChange={(e) => setNewCycle({ ...newCycle, endDate: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Duration Display */}
                                    {cycleDuration > 0 && (
                                        <div className="flex items-center gap-2 text-xs font-bold text-teal-600 bg-teal-50 px-3 py-2 rounded-lg border border-teal-100 animate-in fade-in slide-in-from-top-1">
                                            <Clock size={14} />
                                            自動計算：本週期共 {cycleDuration} 天
                                        </div>
                                    )}

                                    <button type="submit" className="w-full bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold py-2.5 rounded-lg transition-colors text-sm flex justify-center items-center gap-2 border border-teal-200">
                                        <Plus size={16} /> 新增週期
                                    </button>
                                </form>
                            </div>

                            <div className="p-2 overflow-y-auto max-h-[250px]">
                                {cycles.map(cycle => (
                                    <div key={cycle.id} className="group p-3 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-200 mb-1">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <div className="text-sm font-bold text-gray-800">{formatCycleName(cycle.name)}</div>
                                                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 font-medium">
                                                    {cycle.startDate} ~ {cycle.endDate}
                                                    <span className="text-gray-300">|</span>
                                                    <span className="text-gray-400">
                                                        {Math.ceil((new Date(cycle.endDate).getTime() - new Date(cycle.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} 天
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteCycleClick(cycle.id)}
                                                className="text-gray-300 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-white"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {cycles.length === 0 && (
                                    <div className="p-8 text-center text-gray-400 text-sm">
                                        尚未設定週期
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Holiday / Event Management */}
                        <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    特殊日期設定 (主管專用)
                                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{holidays.length}</span>
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleImportHolidays}
                                    className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1.5 rounded-lg font-bold transition-colors border border-blue-100"
                                >
                                    <Globe size={12} /> 匯入台灣假日
                                </button>
                            </div>

                            <div className="p-4 border-b border-gray-100">
                                <form onSubmit={handleAddHoliday} className="flex flex-col gap-2 mb-4">
                                    <div className="flex gap-2">
                                        <input
                                            type="date"
                                            value={newHoliday.date}
                                            onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                                            className="w-1/3 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                            required
                                        />
                                        <input
                                            type="text"
                                            value={newHoliday.name}
                                            onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                                            placeholder="名稱 (例: 科會)"
                                            className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                            required
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <select
                                            value={newHoliday.type}
                                            onChange={(e) => setNewHoliday({ ...newHoliday, type: e.target.value as DateEventType })}
                                            className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer bg-white"
                                        >
                                            <option value={DateEventType.NATIONAL}>國定假日 (紅字)</option>
                                            <option value={DateEventType.NOTE}>備忘 (藍字)</option>
                                            <option value={DateEventType.CLOSED}>休診 (全員預設休假)</option>
                                        </select>
                                        <button type="submit" className="bg-gray-800 text-white px-6 rounded-lg hover:bg-gray-700 flex items-center justify-center">
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                </form>

                                {/* Batch Generator - Collapsible UI */}
                                <details className="group border border-blue-100 rounded-lg bg-blue-50/30 open:bg-blue-50/50 transition-all mb-4">
                                    <summary className="cursor-pointer p-3 text-xs font-bold text-blue-700 flex items-center gap-2 select-none">
                                        <RefreshCw size={14} /> 批量生成特殊日期 (進階)
                                        <span className="ml-auto text-blue-400 group-open:rotate-180 transition-transform"><ChevronDown size={14} /></span>
                                    </summary>
                                    <div className="p-3 pt-0 border-t border-blue-100/50 mt-1">
                                        <form onSubmit={handleBatchGenerate} className="space-y-3 mt-2">
                                            <div className="flex items-center gap-2 text-sm text-gray-700 font-medium flex-wrap">
                                                <span>每</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={batchConfig.frequency}
                                                    onChange={e => setBatchConfig({ ...batchConfig, frequency: e.target.value })}
                                                    className="w-16 bg-white border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:border-blue-500 text-center"
                                                />
                                                <span>個月的 第</span>
                                                <select
                                                    value={batchConfig.nth}
                                                    onChange={e => setBatchConfig({ ...batchConfig, nth: e.target.value })}
                                                    className="bg-white border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:border-blue-500"
                                                >
                                                    <option value="1">1</option>
                                                    <option value="2">2</option>
                                                    <option value="3">3</option>
                                                    <option value="4">4</option>
                                                    <option value="last">最後一個</option>
                                                </select>
                                                <span>個 星期</span>
                                                <select
                                                    value={batchConfig.weekday}
                                                    onChange={e => setBatchConfig({ ...batchConfig, weekday: e.target.value })}
                                                    className="bg-white border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:border-blue-500"
                                                >
                                                    <option value="1">一</option>
                                                    <option value="2">二</option>
                                                    <option value="3">三</option>
                                                    <option value="4">四</option>
                                                    <option value="5">五</option>
                                                    <option value="6">六</option>
                                                    <option value="0">日</option>
                                                </select>
                                            </div>

                                            <div className="flex gap-2 items-center">
                                                <input
                                                    type="month"
                                                    value={batchConfig.startMonth}
                                                    onChange={e => setBatchConfig({ ...batchConfig, startMonth: e.target.value })}
                                                    className="w-1/2 border border-gray-300 rounded px-2 py-1 text-sm"
                                                    required
                                                />
                                                <span className="text-gray-400">~</span>
                                                <input
                                                    type="month"
                                                    value={batchConfig.endMonth}
                                                    onChange={e => setBatchConfig({ ...batchConfig, endMonth: e.target.value })}
                                                    className="w-1/2 border border-gray-300 rounded px-2 py-1 text-sm"
                                                    required
                                                />
                                            </div>

                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={batchConfig.name}
                                                    onChange={e => setBatchConfig({ ...batchConfig, name: e.target.value })}
                                                    placeholder="事件名稱"
                                                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                                                    required
                                                />
                                                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded text-sm font-bold shadow-sm transition-colors whitespace-nowrap">
                                                    生成
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </details>



                            </div>



                            <div className="p-2 overflow-y-auto max-h-[250px]">
                                {holidays.length > 0 ? (
                                    holidays.map(h => (
                                        <div key={h.date} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg text-sm group">
                                            <div className="flex items-center gap-3">
                                                <div className="font-mono text-gray-500 font-bold bg-gray-100 px-2 py-0.5 rounded text-xs">{h.date}</div>
                                                <div className="font-bold text-gray-800">{h.name}</div>
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${getEventTypeColor(h.type)}`}>
                                                    {getEventTypeLabel(h.type)}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteHolidayClick(h.date)}
                                                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-6 text-center text-gray-400 text-sm">無特殊日期設定</div>
                                )}
                            </div>
                        </div>

                        {/* Station Management - SYSTEM ADMIN ONLY */}
                        {isSystemAdmin && (
                            <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit xl:col-span-2">
                                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                    <div>
                                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                            崗位與人力需求 (系統管理員專用)
                                            <span className="text-xs font-semibold text-gray-500 px-2 py-0.5 bg-white border rounded-full">{displayStations.length}</span>
                                        </h3>
                                    </div>

                                    <form onSubmit={handleAddStation} className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newStation}
                                            onChange={(e) => setNewStation(e.target.value)}
                                            placeholder="輸入新崗位名稱..."
                                            className="w-48 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none shadow-sm transition-all"
                                        />
                                        <button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center text-sm font-medium shadow-sm shadow-teal-200">
                                            <Plus size={16} className="mr-1" /> 新增
                                        </button>
                                    </form>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-gray-50/50 text-xs text-gray-500 font-semibold uppercase border-b border-gray-100">
                                            <tr>
                                                <th className="px-6 py-3 text-left w-48 font-bold text-gray-600">崗位名稱</th>
                                                {weekDays.map((d, i) => (
                                                    <th key={i} className={`px-1 py-3 text-center w-16 ${i === 0 || i === 6 ? 'text-red-500' : ''}`}>週{d}</th>
                                                ))}
                                                <th className="px-6 py-3 text-right">移除</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {displayStations.map(station => {
                                                const reqs = requirements[station] || [0, 0, 0, 0, 0, 0, 0];
                                                return (
                                                    <tr key={station} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-6 py-3 text-sm font-bold text-gray-700">{station}</td>
                                                        {reqs.map((count, dayIdx) => (
                                                            <td key={dayIdx} className="px-1 py-3 text-center">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={count}
                                                                    onChange={(e) => handleRequirementChange(station, dayIdx, parseInt(e.target.value) || 0)}
                                                                    className={`w-10 text-center text-sm rounded py-1 outline-none transition-all font-medium 
                                                    ${count > 0 ? 'text-teal-700 bg-teal-50 ring-1 ring-teal-100' : 'text-gray-300 bg-gray-50'} 
                                                    focus:ring-2 focus:ring-teal-500 focus:bg-white`}
                                                                />
                                                            </td>
                                                        ))}
                                                        <td className="px-6 py-3 text-right">
                                                            <button
                                                                onClick={() => handleDeleteStationClick(station)}
                                                                className="text-gray-300 hover:text-red-500 transition-colors p-1.5 hover:bg-red-50 rounded"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {displayStations.length === 0 && (
                                                <tr>
                                                    <td colSpan={9} className="p-12 text-center text-gray-400 text-sm">
                                                        尚未新增任何有效崗位
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-800 p-4 rounded-xl border border-blue-100 flex gap-4 text-sm items-start shadow-sm">
                <div className="p-2 bg-white rounded-lg shadow-sm text-blue-500">
                    <AlertCircle size={20} />
                </div>
                <div>
                    <h4 className="font-bold mb-1 text-blue-900">設定小提示</h4>
                    <ul className="list-disc pl-4 space-y-1 text-blue-700/80 text-xs">
                        <li>「休診」日期：系統會自動將當日所有人員預設為「休假」，除非有手動排班覆蓋。</li>
                        <li>「備忘」日期：僅作為行事曆標記，不影響排班邏輯。</li>
                        <li>更新「循環基準日」會改變所有人四休二的計算起點。</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
