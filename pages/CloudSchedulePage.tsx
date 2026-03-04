
import React, { useState, useMemo, useEffect } from 'react';
import { User, UserRole, ReportAssistant, CloudScheduleEntry } from '../types';
import { db } from '../services/store';
import { Cloud, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Check, X, UserCheck, Save, AlertCircle } from 'lucide-react';

interface CloudSchedulePageProps {
    currentUser: User;
}

const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

const CloudSchedulePage: React.FC<CloudSchedulePageProps> = ({ currentUser }) => {
    const isEditor = currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN;

    const [currentDate, setCurrentDate] = useState(new Date());
    const [assistants, setAssistants] = useState<ReportAssistant[]>(() => db.getReportAssistants());
    const [entries, setEntries] = useState<CloudScheduleEntry[]>(() => db.getCloudScheduleEntries());

    // Local dirty tracking: date -> partial entry
    const [dirtyEntries, setDirtyEntries] = useState<Record<string, { assistantIds: string[]; proofreaderUserId?: string }>>({});
    const [savingDates, setSavingDates] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<string | null>(null);

    // Manage assistants panel
    const [showManagePanel, setShowManagePanel] = useState(false);
    const [editingAssistant, setEditingAssistant] = useState<Partial<ReportAssistant> | null>(null);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(PALETTE[0]);

    const radiographers = db.getUsers().filter(u => u.isRadiographer && u.isActive !== false);

    // Subscribe store
    useEffect(() => {
        const unsub = db.subscribe(() => {
            setAssistants([...db.getReportAssistants()]);
            setEntries([...db.getCloudScheduleEntries()]);
        });
        return unsub;
    }, []);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    // Build month date array
    const monthDates = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const days: string[] = [];
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        }
        return days;
    }, [currentDate]);

    // Get effective entry for a date (dirty overrides persisted)
    const getEntry = (date: string) => {
        const dirty = dirtyEntries[date];
        const persisted = entries.find(e => e.date === date);
        if (dirty) return { assistantIds: dirty.assistantIds, proofreaderUserId: dirty.proofreaderUserId };
        if (persisted) return { assistantIds: persisted.assistantIds, proofreaderUserId: persisted.proofreaderUserId };
        return { assistantIds: [], proofreaderUserId: undefined };
    };

    const toggleAssistantOnDate = (date: string, assistantId: string) => {
        if (!isEditor) return;
        const current = getEntry(date);
        const newIds = current.assistantIds.includes(assistantId)
            ? current.assistantIds.filter(id => id !== assistantId)
            : [...current.assistantIds, assistantId];
        setDirtyEntries(prev => ({ ...prev, [date]: { ...current, assistantIds: newIds } }));
    };

    const setProofreader = (date: string, userId: string) => {
        if (!isEditor) return;
        const current = getEntry(date);
        const value = userId === '' ? undefined : userId;
        setDirtyEntries(prev => ({ ...prev, [date]: { ...current, proofreaderUserId: value } }));
    };

    const saveDate = async (date: string) => {
        const current = getEntry(date);
        setSavingDates(prev => new Set(prev).add(date));
        try {
            await db.upsertCloudScheduleEntry({ date, assistantIds: current.assistantIds, proofreaderUserId: current.proofreaderUserId });
            setDirtyEntries(prev => { const n = { ...prev }; delete n[date]; return n; });
            showToast(`${date} 已儲存`);
        } catch (e) {
            showToast('儲存失敗');
        } finally {
            setSavingDates(prev => { const n = new Set(prev); n.delete(date); return n; });
        }
    };

    // Manage assistants CRUD
    const handleAddAssistant = async () => {
        if (!newName.trim()) return;
        const assistant: ReportAssistant = {
            id: crypto.randomUUID(),
            name: newName.trim(),
            color: newColor,
            isActive: true,
        };
        await db.addReportAssistant(assistant);
        setNewName('');
        setNewColor(PALETTE[0]);
    };

    const handleUpdateAssistant = async () => {
        if (!editingAssistant?.id || !editingAssistant.name?.trim()) return;
        await db.updateReportAssistant({
            id: editingAssistant.id,
            name: editingAssistant.name.trim(),
            color: editingAssistant.color,
            isActive: editingAssistant.isActive ?? true,
        });
        setEditingAssistant(null);
    };

    const handleDeleteAssistant = async (id: string) => {
        if (!confirm('確定要刪除此報告助理嗎？')) return;
        await db.deleteReportAssistant(id);
    };

    const activeAssistants = assistants.filter(a => a.isActive !== false);

    const monthLabel = currentDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
    const todayStr = new Date().toISOString().split('T')[0];

    return (
        <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
            {/* Toast */}
            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm px-4 py-2 rounded-xl shadow-xl z-50 animate-bounce-slow">
                    {toast}
                </div>
            )}

            {/* Header */}
            <div className="flex-none px-6 py-4 bg-white border-b border-slate-200 shadow-sm">
                <div className="flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-50 text-sky-600 rounded-lg"><Cloud size={20} /></div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">影像雲班表</h2>
                            <p className="text-xs text-slate-400">報告助理排班 · 放射師校對</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Month nav */}
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl shadow-sm px-2 py-1">
                            <button onClick={() => setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })}
                                className="p-1 text-slate-400 hover:text-sky-600 rounded transition-colors">
                                <ChevronLeft size={16} />
                            </button>
                            <span className="font-bold text-slate-700 text-sm min-w-[100px] text-center">{monthLabel}</span>
                            <button onClick={() => setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })}
                                className="p-1 text-slate-400 hover:text-sky-600 rounded transition-colors">
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        {isEditor && (
                            <button
                                onClick={() => setShowManagePanel(v => !v)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${showManagePanel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300'}`}
                            >
                                <UserCheck size={15} /> 管理助理
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Main Schedule Table */}
                <div className="flex-1 overflow-auto p-4">
                    {activeAssistants.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-4">
                            <AlertCircle size={40} className="text-slate-300" />
                            <p className="text-sm font-medium">尚無報告助理，請先點「管理助理」新增</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {monthDates.map(date => {
                                const entry = getEntry(date);
                                const isDirty = !!dirtyEntries[date];
                                const isSaving = savingDates.has(date);
                                const isToday = date === todayStr;
                                const d = new Date(date);
                                const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
                                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                const proofreader = radiographers.find(u => u.id === entry.proofreaderUserId);

                                return (
                                    <div
                                        key={date}
                                        className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isToday ? 'border-sky-300 shadow-sky-100' : (isDirty ? 'border-amber-300' : 'border-slate-200')}`}
                                    >
                                        {/* Day Header */}
                                        <div className={`px-4 py-3 flex items-center justify-between ${isToday ? 'bg-sky-50' : (isWeekend ? 'bg-slate-50' : 'bg-white')} border-b border-inherit`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center font-bold shadow-sm ${isToday ? 'bg-sky-500 text-white' : (isWeekend ? 'bg-slate-200 text-slate-600' : 'bg-slate-100 text-slate-700')}`}>
                                                    <span className="text-[9px] leading-none">{weekDays[d.getDay()]}</span>
                                                    <span className="text-base leading-none">{d.getDate()}</span>
                                                </div>
                                                {isDirty && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">未儲存</span>}
                                            </div>

                                            {isEditor && (
                                                <button
                                                    onClick={() => saveDate(date)}
                                                    disabled={!isDirty || isSaving}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isDirty ? 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                                >
                                                    <Save size={12} /> {isSaving ? '儲存中...' : '儲存'}
                                                </button>
                                            )}
                                        </div>

                                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Report Assistants */}
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">報告助理</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {activeAssistants.map(asst => {
                                                        const isOn = entry.assistantIds.includes(asst.id);
                                                        return (
                                                            <button
                                                                key={asst.id}
                                                                onClick={() => toggleAssistantOnDate(date, asst.id)}
                                                                disabled={!isEditor}
                                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border transition-all ${isOn
                                                                    ? 'text-white shadow-sm scale-105'
                                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                                                                } ${!isEditor ? 'cursor-default' : 'cursor-pointer active:scale-95'}`}
                                                                style={isOn ? { backgroundColor: asst.color || '#6366f1', borderColor: asst.color || '#6366f1' } : {}}
                                                            >
                                                                {isOn && <Check size={12} />}
                                                                {asst.name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Proofreader */}
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">放射師校對</p>
                                                {isEditor ? (
                                                    <select
                                                        value={entry.proofreaderUserId || ''}
                                                        onChange={e => setProofreader(date, e.target.value)}
                                                        className="w-full max-w-[200px] text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-sky-500 outline-none bg-white font-medium text-slate-700"
                                                    >
                                                        <option value="">— 未指定 —</option>
                                                        {radiographers.map(u => (
                                                            <option key={u.id} value={u.id}>{u.name}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <div className={`flex items-center gap-2 ${proofreader ? '' : 'text-slate-400'}`}>
                                                        {proofreader ? (
                                                            <>
                                                                <div
                                                                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                                                                    style={{ backgroundColor: proofreader.color || '#9CA3AF' }}
                                                                >
                                                                    {proofreader.alias || proofreader.name[0]}
                                                                </div>
                                                                <span className="font-bold text-slate-700">{proofreader.name}</span>
                                                            </>
                                                        ) : (
                                                            <span className="text-sm italic">未指定</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Manage Assistants Side Panel */}
                {showManagePanel && isEditor && (
                    <div className="w-72 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden shadow-xl">
                        <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-bold text-slate-800">報告助理管理</h3>
                            <button onClick={() => setShowManagePanel(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Add new */}
                        <div className="p-4 border-b border-slate-100 bg-slate-50 space-y-3">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">新增助理</label>
                            <input
                                type="text"
                                placeholder="姓名"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddAssistant()}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-400 outline-none"
                            />
                            <div>
                                <p className="text-[10px] text-slate-400 mb-1.5">顏色</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {PALETTE.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setNewColor(c)}
                                            className={`w-6 h-6 rounded-full border-2 transition-transform ${newColor === c ? 'border-slate-800 scale-125' : 'border-transparent'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={handleAddAssistant}
                                disabled={!newName.trim()}
                                className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-sky-700 active:scale-95 transition-all"
                            >
                                <Plus size={14} /> 新增
                            </button>
                        </div>

                        {/* Existing list */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {assistants.length === 0 && <p className="text-sm text-slate-400 text-center pt-4">尚無助理</p>}
                            {assistants.map(asst => (
                                <div key={asst.id} className={`rounded-xl border p-3 transition-all ${asst.isActive !== false ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50 opacity-60'}`}>
                                    {editingAssistant?.id === asst.id ? (
                                        <div className="space-y-2">
                                            <input
                                                type="text"
                                                value={editingAssistant.name || ''}
                                                onChange={e => setEditingAssistant(prev => ({ ...prev, name: e.target.value }))}
                                                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-sky-400"
                                            />
                                            <div className="flex flex-wrap gap-1">
                                                {PALETTE.map(c => (
                                                    <button
                                                        key={c}
                                                        onClick={() => setEditingAssistant(prev => ({ ...prev, color: c }))}
                                                        className={`w-5 h-5 rounded-full border-2 ${editingAssistant.color === c ? 'border-slate-700 scale-125' : 'border-transparent'}`}
                                                        style={{ backgroundColor: c }}
                                                    />
                                                ))}
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={handleUpdateAssistant} className="flex-1 text-xs font-bold bg-teal-600 text-white py-1.5 rounded-lg hover:bg-teal-700 flex items-center justify-center gap-1">
                                                    <Check size={12} /> 確認
                                                </button>
                                                <button onClick={() => setEditingAssistant(null)} className="flex-1 text-xs font-bold bg-slate-100 text-slate-600 py-1.5 rounded-lg hover:bg-slate-200 flex items-center justify-center gap-1">
                                                    <X size={12} /> 取消
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{ backgroundColor: asst.color || '#9CA3AF' }}>
                                                {asst.name[0]}
                                            </div>
                                            <span className="flex-1 text-sm font-bold text-slate-700 truncate">{asst.name}</span>
                                            <button onClick={() => setEditingAssistant({ ...asst })} className="p-1 text-slate-400 hover:text-sky-600 rounded">
                                                <Pencil size={13} />
                                            </button>
                                            <button onClick={() => handleDeleteAssistant(asst.id)} className="p-1 text-slate-400 hover:text-red-500 rounded">
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CloudSchedulePage;
