import React, { useState, useMemo, useEffect } from 'react';
import { User, UserRole, ReportAssistant, CloudScheduleEntry, Doctor } from '../types';
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
    const [doctors, setDoctors] = useState<Doctor[]>(() => db.getDoctors());
    const [shifts, setShifts] = useState(() => db.doctorShifts);

    // Local dirty tracking: key (date_doctorId) -> partial entry
    const [dirtyEntries, setDirtyEntries] = useState<Record<string, { assistantIds: string[]; proofreaderUserId?: string }>>({});
    const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<string | null>(null);

    // Edit Mode Toggle
    const [isEditing, setIsEditing] = useState(false);

    // Manage assistants panel
    const [showManagePanel, setShowManagePanel] = useState(false);
    const [editingAssistant, setEditingAssistant] = useState<Partial<ReportAssistant> | null>(null);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(PALETTE[0]);

    const radiographers = db.getUsers().filter(u => u.isRadiographer && u.isActive !== false);

    const radiologists = useMemo(() => {
        return doctors
            .filter(d => d.specialty === '放射科')
            .sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999));
    }, [doctors]);

    // Subscribe store
    useEffect(() => {
        const unsub = db.subscribe(() => {
            setAssistants([...db.getReportAssistants()]);
            setEntries([...db.getCloudScheduleEntries()]);
            setDoctors([...db.getDoctors()]);
            setShifts([...db.doctorShifts]);
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

    // Get effective entry for a date + doctor (dirty overrides persisted)
    const getEntry = (date: string, doctorId: string) => {
        const key = `${date}_${doctorId}`;
        const dirty = dirtyEntries[key];
        const persisted = entries.find(e => e.date === date && e.doctorId === doctorId);
        if (dirty) return { assistantIds: dirty.assistantIds, proofreaderUserId: dirty.proofreaderUserId };
        if (persisted) return { assistantIds: persisted.assistantIds, proofreaderUserId: persisted.proofreaderUserId };
        return { assistantIds: [], proofreaderUserId: undefined };
    };

    const setAssistant = (date: string, doctorId: string, assistantId: string) => {
        if (!isEditing) return;
        const key = `${date}_${doctorId}`;
        const current = getEntry(date, doctorId);
        const newIds = assistantId ? [assistantId] : [];
        setDirtyEntries(prev => ({ ...prev, [key]: { ...current, assistantIds: newIds } }));
    };

    const setProofreader = (date: string, doctorId: string, userId: string) => {
        if (!isEditing) return;
        const key = `${date}_${doctorId}`;
        const current = getEntry(date, doctorId);
        const value = userId === '' ? undefined : userId;
        setDirtyEntries(prev => ({ ...prev, [key]: { ...current, proofreaderUserId: value } }));
    };

    const saveEntry = async (date: string, doctorId: string) => {
        const key = `${date}_${doctorId}`;
        const current = getEntry(date, doctorId);
        setSavingKeys(prev => new Set(prev).add(key));
        try {
            const payload = { 
                date, 
                doctorId,
                assistantIds: current.assistantIds, 
                proofreaderUserId: current.proofreaderUserId 
            };
            console.log('[CloudSchedulePage] Attempting saveEntry:', payload);
            await db.upsertCloudScheduleEntry(payload);
            setDirtyEntries(prev => { const n = { ...prev }; delete n[key]; return n; });
            showToast(`已儲存`);
        } catch (e: any) {
            showToast(`儲存失敗: ${e.message || e.toString()}`);
        } finally {
            setSavingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
        }
    };

    // Manage assistants CRUD
    const handleAddAssistant = async () => {
        if (!newName.trim()) return;
        const assistant: ReportAssistant = {
            id: (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)),
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

    // Export Placeholder
    const exportToExcel = () => {
        showToast('準備匯出 Excel...');
    };

    const exportToPDF = () => {
        showToast('準備匯出 PDF...');
    };

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
                            <p className="text-xs text-slate-400">影像醫學部醫師 · 報告助理指定</p>
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
                            <button onClick={() => setCurrentDate(new Date())} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 ml-1">
                                本月
                            </button>
                        </div>

                        {/* Export Buttons */}
                        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                            <button onClick={exportToExcel} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors">
                                匯出 Excel
                            </button>
                            <button onClick={exportToPDF} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors">
                                匯出 PDF
                            </button>
                        </div>

                        {isEditor && (
                            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                                <button
                                    onClick={() => setIsEditing(!isEditing)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${isEditing ? 'bg-sky-600 text-white border-sky-600 shadow-md animate-pulse' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    <Pencil size={15} /> {isEditing ? '完成' : '編輯模式'}
                                </button>
                                <button
                                    onClick={() => setShowManagePanel(v => !v)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${showManagePanel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300'}`}
                                >
                                    <UserCheck size={15} /> 管理助理
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Main Schedule Table */}
                <div className="flex-1 overflow-auto p-4 md:p-6">
                    {activeAssistants.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-4">
                            <AlertCircle size={40} className="text-slate-300" />
                            <p className="text-sm font-medium">尚無報告助理，請先點「管理助理」新增</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm inline-block min-w-full pb-20 overflow-x-hidden">
                            <table className="border-collapse w-full table-fixed text-[10px]">
                                <thead className="relative z-50">
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="p-1 text-center font-bold text-slate-600 min-w-[70px] sticky left-0 top-0 bg-slate-50 z-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            醫師
                                        </th>
                                        {monthDates.map(date => {
                                            const d = new Date(date);
                                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                            const isToday = date === todayStr;

                                            return (
                                                <th 
                                                    key={date} 
                                                    className={`px-0 py-1 text-center border-r border-slate-100 min-w-[45px] sticky top-0 z-40 ${isToday ? 'bg-teal-50' : (isWeekend ? 'bg-red-50' : 'bg-white')} border-b border-slate-200`}
                                                >
                                                    <div className={`font-bold text-[11px] leading-tight ${isToday ? 'text-teal-600' : (isWeekend ? 'text-red-500' : 'text-slate-800')}`}>{d.getDate()}</div>
                                                    <div className={`text-[10px] opacity-75 leading-tight ${isToday ? 'text-teal-600' : (isWeekend ? 'text-red-500' : 'text-slate-700')}`}>
                                                        {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
                                                    </div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {radiologists.map(doc => (
                                        <tr key={doc.id} className="group hover:bg-slate-50/50 transition-colors">
                                            {/* Sticky Doctor Col */}
                                            <td className="p-0 border-r border-slate-200 sticky left-0 bg-white z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] align-middle text-center">
                                                <div className="p-1 font-bold text-slate-800 flex flex-col items-center justify-center gap-1 w-full">
                                                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 mx-auto">
                                                        {doc.alias || doc.name.charAt(0)}
                                                    </div>
                                                    <span className="text-[11px] truncate">{doc.alias || doc.name}</span>
                                                </div>
                                            </td>

                                            {/* Days Cols */}
                                            {monthDates.map(date => {
                                                const d = new Date(date);
                                                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                                const key = `${date}_${doc.id}`;
                                                
                                                // Find if doctor is scheduled today and location is Beitou
                                                const docShift = shifts.find(s => s.date === date && s.doctorId === doc.id);
                                                const isBeitou = docShift?.location === '北投';
                                                
                                                // Check background tint
                                                const isImagingTask = docShift?.task?.includes('影像') || docShift?.scheduled_station?.includes('影像');
                                                const isSupportTask = docShift?.task?.includes('支援') || docShift?.scheduled_station?.includes('支援');
                                                const isRemoteTask = docShift?.task?.includes('遠') || docShift?.scheduled_station?.includes('遠') || docShift?.task?.toLowerCase().includes('remote') || docShift?.scheduled_station?.toLowerCase().includes('remote');
                                                
                                                let bgColor = isWeekend ? 'bg-slate-50' : 'bg-white';
                                                
                                                if (docShift) {
                                                    // Priority coloring
                                                    if (isRemoteTask) bgColor = 'bg-pink-100';
                                                    else if (isSupportTask) bgColor = 'bg-yellow-100';
                                                    else if (isImagingTask) bgColor = 'bg-sky-50';
                                                }

                                                const isEditable = isBeitou || isRemoteTask;

                                                // State data mapped
                                                const entry = getEntry(date, doc.id);
                                                const isDirty = !!dirtyEntries[key];
                                                const isSaving = savingKeys.has(key);
                                                const proofreader = radiographers.find(u => u.id === entry.proofreaderUserId);

                                                return (
                                                    <td key={date} className={`p-1 align-top border-r border-slate-100 ${bgColor} relative group transition-colors hover:bg-slate-50`}>
                                                        {!docShift ? (
                                                            <div className="h-full w-full min-h-[50px] flex items-center justify-center text-[10px] text-slate-300">沒班</div>
                                                        ) : !isEditable ? (
                                                            <div className="h-full w-full min-h-[50px] flex flex-col items-center justify-center text-[10px] leading-tight">
                                                                <span className="text-slate-400 truncate w-full text-center">{docShift.location}</span>
                                                                <span className="text-slate-500 font-bold truncate w-full text-center">{docShift.scheduled_station}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col min-h-[50px] gap-1 items-center justify-center relative w-full pt-1">
                                                                {/* Task Hint */}
                                                                <div className={`text-[11px] font-bold leading-tight w-full text-center whitespace-normal break-words ${isRemoteTask ? 'text-pink-700' : isSupportTask ? 'text-yellow-700' : isImagingTask ? 'text-sky-700' : 'text-slate-600'}`}>
                                                                    {docShift.scheduled_station}
                                                                </div>
                                                                
                                                                {isDirty && (
                                                                     <button 
                                                                        onClick={() => saveEntry(date, doc.id)} 
                                                                        disabled={isSaving}
                                                                        className="absolute top-0 right-0 text-[7px] bg-sky-500 text-white px-1 py-0 rounded shadow-sm hover:bg-sky-600 disabled:opacity-50 flex items-center shrink-0 z-10"
                                                                     >
                                                                        {isSaving ? '...' : <Save size={8} />}
                                                                    </button>
                                                                )}

                                                                {/* Assistant Select */}
                                                                <div className="w-full mt-0.5">
                                                                    {isEditing ? (
                                                                        <select
                                                                            value={entry.assistantIds[0] || ''}
                                                                            onChange={e => setAssistant(date, doc.id, e.target.value)}
                                                                            className={`w-full text-[10px] border rounded-[3px] p-0 outline-none font-bold h-5 leading-tight text-center ${entry.assistantIds.length > 0 ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-300 bg-white text-slate-500'}`}
                                                                        >
                                                                            <option value="">--</option>
                                                                            {activeAssistants.map(asst => (
                                                                                <option key={asst.id} value={asst.id}>{asst.name}</option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <div className="text-[11px] font-bold text-sky-700 w-full text-center whitespace-normal break-words">
                                                                            {entry.assistantIds.length > 0 ? (
                                                                                activeAssistants.find(a => a.id === entry.assistantIds[0])?.name || '-'
                                                                            ) : '-'}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Proofreader Select */}
                                                                <div className="mt-auto pt-0.5 w-full">
                                                                    {isEditing ? (
                                                                        <select
                                                                            value={entry.proofreaderUserId || ''}
                                                                            onChange={e => setProofreader(date, doc.id, e.target.value)}
                                                                            className={`w-full text-[10px] border rounded-[3px] p-0 outline-none font-bold h-5 leading-tight text-center ${entry.proofreaderUserId ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white text-slate-500'}`}
                                                                        >
                                                                            <option value="">--</option>
                                                                            {radiographers.map(u => (
                                                                                <option key={u.id} value={u.id}>{u.name}</option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <div className="text-[11px] font-bold text-indigo-700 w-full text-center whitespace-normal break-words">
                                                                            {proofreader ? proofreader.name : '-'}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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
