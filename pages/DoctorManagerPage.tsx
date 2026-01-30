import React, { useState, useEffect } from 'react';
import { db } from '../services/store';
import { UserRole } from '../types';
import type { Doctor, FixedShift, WeekdaySetting } from '../types';
import { Users, Trash2, Plus, Save, Square, CheckSquare, Pencil, AlertCircle, Clock } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

interface DoctorManagerPageProps {
    currentUser: any;
}

const PREDEFINED_COLORS = [
    '#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'
];

const LOCATIONS = ['北投', '大直', '台中'];

const DoctorManagerPage: React.FC<DoctorManagerPageProps> = ({ currentUser }) => {
    const [doctors, setDoctors] = useState<Doctor[]>(db.getDoctors());
    // Get ALL stations from settings, plus default hardcoded ones to ensure complete list
    // Get ALL stations from settings, plus default hardcoded ones to ensure complete list
    const [availableStations, setAvailableStations] = useState<string[]>(() => {
        const raw = db.settings.doctorStations?.map(s => typeof s === 'string' ? s : s.name) || ['解說', '影像', '遠距', 'GI', '行政', '麻醉'];
        return Array.from(new Set(raw));
    });
    
    // Form State
    const [formData, setFormData] = useState<{
        name: string;
        alias: string;
        specialty: string;
        capabilities: string[];
        excludedDays: number[];
        locations: string[];
        excludedAutoScheduleLocations: string[];
        isPartTime: boolean;
        monthlyTargetShifts?: number;
        fixedShifts: FixedShift[];
        weekdaySettings: WeekdaySetting[];
    }>({
        name: '',
        alias: '',
        specialty: '',
        capabilities: [],
        excludedDays: [],
        locations: ['北投'], // Default to Beitou
        excludedAutoScheduleLocations: [],
        isPartTime: false,
        monthlyTargetShifts: undefined,
        fixedShifts: [],
        weekdaySettings: []
    });

    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Sync data
    useEffect(() => {
        const unsubscribe = db.subscribe(() => {
            setDoctors([...db.getDoctors()]);
            // Safe map handling for older string[] data or new DoctorStationConfig[]
            const rawStations = db.settings.doctorStations?.map(s => typeof s === 'string' ? s : s.name) || ['解說', '影像', '遠距', 'GI', '行政', '麻醉'];
            const stations = Array.from(new Set(rawStations));
            setAvailableStations(stations);
        });
        return unsubscribe;
    }, []);

    const resetForm = () => {
        setFormData({ name: '', alias: '', specialty: '', capabilities: [], excludedDays: [], locations: ['北投'], excludedAutoScheduleLocations: [], isPartTime: false, monthlyTargetShifts: undefined, fixedShifts: [], weekdaySettings: [] });
        setEditingId(null);
        setError(null);
    };

    const handleEdit = (doc: Doctor) => {
        setEditingId(doc.id);
        const caps = doc.capabilities || [];
        setFormData({
            name: doc.name,
            alias: doc.alias || '',
            specialty: doc.specialty || '',
            capabilities: caps,
            excludedDays: doc.excludedDays || [],
            locations: doc.locations || [],
            excludedAutoScheduleLocations: doc.excludedAutoScheduleLocations || [],
            isPartTime: doc.isPartTime || false,
            monthlyTargetShifts: doc.monthlyTargetShifts,
            fixedShifts: doc.fixedShifts || [],
            weekdaySettings: doc.weekdaySettings || []
        });
        
        // Pre-fill fixed shift station if capabilities exist
        if (caps.length > 0) {
            setNewFixedShift(prev => ({ ...prev, station: caps[0] }));
        }
        
        setError(null);
    };

    const toggleCapability = (cap: string) => {
        setFormData(prev => {
            const exists = prev.capabilities.includes(cap);
            let nextCaps;
            if (exists) {
                nextCaps = prev.capabilities.filter(c => c !== cap);
            } else {
                nextCaps = [...prev.capabilities, cap];
            }
            
            // If newFixedShift.station is empty and we just added a capability, pre-fill it
            if (!newFixedShift.station && nextCaps.length > 0) {
                setNewFixedShift(f => ({ ...f, station: nextCaps[0] }));
            }
            
            return { ...prev, capabilities: nextCaps };
        });
    };

    const toggleExcludedDay = (day: number) => {
        setFormData(prev => {
            const exists = prev.excludedDays.includes(day);
            if (exists) {
                return { ...prev, excludedDays: prev.excludedDays.filter(d => d !== day) };
            } else {
                return { ...prev, excludedDays: [...prev.excludedDays, day] };
            }
        });
    };

    const toggleLocation = (loc: string) => {
        setFormData(prev => {
            const exists = prev.locations.includes(loc);
            if (exists) {
                // If removing location, also remove from exclusion list to keep clean
                const newLocs = prev.locations.filter(l => l !== loc);
                const newExclusions = prev.excludedAutoScheduleLocations.filter(l => l !== loc);
                return { ...prev, locations: newLocs, excludedAutoScheduleLocations: newExclusions };
            } else {
                return { ...prev, locations: [...prev.locations, loc] };
            }
        });
    };

    const toggleLocationExclusion = (loc: string) => {
        setFormData(prev => {
             // Only toggle if location is selected
            if (!prev.locations.includes(loc)) return prev;

            const exists = prev.excludedAutoScheduleLocations.includes(loc);
            if (exists) {
                return { ...prev, excludedAutoScheduleLocations: prev.excludedAutoScheduleLocations.filter(l => l !== loc) };
            } else {
                return { ...prev, excludedAutoScheduleLocations: [...prev.excludedAutoScheduleLocations, loc] };
            }
        });
    };

    // Fixed Shift Helpers
    const [newFixedShift, setNewFixedShift] = useState<{day: number, station: string, location: string, time: string}>({ day: 1, station: '', location: '北投', time: '' });

    const handleAddFixedShift = () => {
        if (!newFixedShift.station) return;
        const newShift: FixedShift = {
            dayOfWeek: newFixedShift.day,
            station: newFixedShift.station,
            location: newFixedShift.location,
            workTime: newFixedShift.time
        };
        setFormData(prev => ({
            ...prev,
            fixedShifts: [...prev.fixedShifts, newShift]
        }));
        setNewFixedShift(prev => ({ ...prev, station: '', time: '' }));
    };

    const handleRemoveFixedShift = (index: number) => {
        setFormData(prev => ({
            ...prev,
            fixedShifts: prev.fixedShifts.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            setError('請輸入醫師姓名');
            return;
        }

        const alias = formData.alias || formData.name.charAt(0);

        if (editingId) {
            const currentDoctor = doctors.find(d => d.id === editingId);
            await db.updateDoctor({
                id: editingId,
                name: formData.name,
                alias,
                specialty: formData.specialty,
                capabilities: formData.capabilities,
                excludedDays: formData.excludedDays,
                locations: formData.locations,
                excludedAutoScheduleLocations: formData.excludedAutoScheduleLocations,
                isPartTime: formData.isPartTime,
                monthlyTargetShifts: formData.monthlyTargetShifts,
                fixedShifts: formData.fixedShifts,
                weekdaySettings: formData.weekdaySettings,
                displayOrder: currentDoctor?.displayOrder // Preserve original position
            });
        } else {
            const result = await db.addDoctor(
                formData.name, 
                alias, 
                formData.capabilities, 
                formData.locations, 
                formData.excludedDays, 
                formData.excludedAutoScheduleLocations, 
                formData.isPartTime, 
                formData.specialty, 
                formData.monthlyTargetShifts,
                formData.weekdaySettings
            );
            if (!result.success) {
                setError(result.error || '新增失敗');
                return;
            }
            // Update with specialty, fixedShifts, AND weekdaySettings immediately
            if ((formData.specialty || formData.fixedShifts.length > 0 || formData.weekdaySettings.length > 0) && result.id) {
               await db.updateDoctor({ 
                   id: result.id, 
                   name: formData.name, 
                   specialty: formData.specialty, 
                   capabilities: formData.capabilities, 
                   locations: formData.locations, 
                   excludedDays: formData.excludedDays, 
                   excludedAutoScheduleLocations: formData.excludedAutoScheduleLocations, 
                   isPartTime: formData.isPartTime,
                   fixedShifts: formData.fixedShifts,
                   weekdaySettings: formData.weekdaySettings
               });
            }
        }
        resetForm();
    };

    const handleDelete = async () => {
        if (deleteTargetId) {
            await db.deleteDoctor(deleteTargetId);
            setDeleteTargetId(null);
        }
    };

    // Station Settings Logic (Quick Add)
    const [newStationName, setNewStationName] = useState('');
    const handleAddStation = async () => {
        if(!newStationName.trim()) return;
        const current = db.settings.doctorStations || [];
        const name = newStationName.trim();
        if(!current.some(s => s.name === name)) {
            // Default to '北投' for quick add
            db.settings.doctorStations = [...current, { name: name, location: '北投' }];
            await db.saveSettings();
            setNewStationName('');
        }
    }
    
    const handleRemoveStation = async (station: string) => {
         // Optionally confirm?
         const current = db.settings.doctorStations || [];
         db.settings.doctorStations = current.filter(s => s.name !== station);
         await db.saveSettings();
    }


    if (currentUser.role !== UserRole.SYSTEM_ADMIN && currentUser.role !== UserRole.SCHEDULER) {
        return <div className="p-8 text-center text-gray-500">權限不足</div>;
    }

    // --- UI Helpers ---
    const getSpecialtyColor = (specialty?: string) => {
        switch (specialty) {
            case '家醫科': return 'bg-orange-100 text-orange-700 border-orange-200';
            case '腸胃科': return 'bg-blue-100 text-blue-700 border-blue-200';
            case '放射科': return 'bg-teal-100 text-teal-700 border-teal-200';
            case '一般名醫': return 'bg-purple-100 text-purple-700 border-purple-200';
            case '其他': return 'bg-gray-100 text-gray-700 border-gray-200';
            default: return 'bg-slate-50 text-slate-600 border-gray-200';
        }
    };

    // Sorted Doctors: Regular < PartTime, then Specialty, then Name
    const sortedDoctors = React.useMemo(() => {
        return [...doctors].sort((a, b) => {
            // 1. Part-Time Check (False first)
            if (a.isPartTime !== b.isPartTime) {
                return a.isPartTime ? 1 : -1;
            }
            // 2. Specialty Grouping
            const specA = a.specialty || 'zz-none'; // Put empty at end
            const specB = b.specialty || 'zz-none';
            if (specA !== specB) {
                 // Use predefined order if possible
                 const order = db.settings.doctorSpecialties || ['家醫科', '腸胃科', '放射科', '一般名醫', '其他'];
                 const idxA = order.indexOf(specA);
                 const idxB = order.indexOf(specB);
                 if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                 if (idxA !== -1) return -1;
                 if (idxB !== -1) return 1;
                 return specA.localeCompare(specB);
            }
            // 3. Name Sorting
            return a.name.localeCompare(b.name);
        });
    }, [doctors]);

    return (
        <div className="flex h-full bg-slate-50 relative overflow-hidden">
             {/* Left Panel: Form */}
             <div className="w-96 bg-white border-r border-gray-200 flex flex-col z-20 shadow-lg">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        {editingId ? <Pencil size={20} className="text-teal-600"/> : <Plus size={20} className="text-teal-600"/>}
                        {editingId ? '編輯醫師資料' : '新增醫師'}
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                        {editingId ? '修改醫師基本資料與可勝任崗位' : '輸入資料建立新的醫師排班資源'}
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2 border border-red-100">
                                <AlertCircle size={16} className="mt-0.5 shrink-0"/>
                                {error}
                            </div>
                        )}

                        {/* Basic Info */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">姓名 <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                    placeholder="例如：王小明"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">顯示縮寫</label>
                                <input
                                    type="text"
                                    value={formData.alias}
                                    onChange={e => setFormData({...formData, alias: e.target.value})}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                    placeholder="預設為姓名首字"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">專科 (Specialty)</label>
                                <select
                                    value={formData.specialty}
                                    onChange={e => setFormData({...formData, specialty: e.target.value})}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none transition-all bg-white"
                                >
                                    <option value="">-- 無 --</option>
                                    {(db.settings.doctorSpecialties || ['家醫科', '腸胃科', '放射科', '一般名醫', '其他']).map(spec => (
                                        <option key={spec} value={spec}>{spec}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Part-Time Toggle */}
                        <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                             <div className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${formData.isPartTime ? 'bg-yellow-500' : 'bg-gray-300'}`}
                                  onClick={() => setFormData({...formData, isPartTime: !formData.isPartTime})}
                             >
                                 <div className={`w-4 h-4 bg-white rounded-full transition-transform ${formData.isPartTime ? 'translate-x-4' : 'translate-x-0'}`}></div>
                             </div>
                             <div>
                                 <div className="text-sm font-bold text-gray-800">兼職醫師 (Part-time)</div>
                                 <div className="text-xs text-gray-500">勾選此項，人員視角報表匯出時將隱藏此醫師</div>
                             </div>
                        </div>

                        {/* Locations */}
                        <div>
                             <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">可排班地點 (Locations)</label>
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">點選地點啟用，右側開關設定是否自動排班</span>
                            </div>
                            <div className="space-y-2">
                                {LOCATIONS.map(loc => {
                                    const isSelected = formData.locations.includes(loc);
                                    const isExcluded = formData.excludedAutoScheduleLocations.includes(loc);
                                    
                                    return (
                                        <div key={loc} className={`flex items-center justify-between p-2 rounded-lg border transition-all ${isSelected ? 'bg-white border-teal-200 shadow-sm' : 'bg-slate-50 border-gray-100 opacity-60'}`}>
                                            <button
                                                type="button"
                                                onClick={() => toggleLocation(loc)}
                                                className="flex items-center gap-3 flex-1"
                                            >
                                                <div className={`w-5 h-5 rounded flex items-center justify-center border ${isSelected ? 'bg-teal-500 border-teal-600 text-white' : 'bg-white border-gray-300'}`}>
                                                    {isSelected && <CheckSquare size={14} />}
                                                </div>
                                                <span className={`text-sm font-bold ${isSelected ? 'text-gray-800' : 'text-gray-400'}`}>{loc}</span>
                                            </button>
                                            
                                            {isSelected && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleLocationExclusion(loc)}
                                                    className={`text-xs px-2 py-1 rounded border transition-all flex items-center gap-1 ${isExcluded ? 'bg-red-50 text-red-500 border-red-200' : 'bg-green-50 text-green-600 border-green-200'}`}
                                                    title={isExcluded ? "此地點不參與自動排班" : "此地點允許自動排班"}
                                                >
                                                    {isExcluded ? '🚫 禁自動排' : '✅ 可自動排'}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Capabilities */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">可勝任崗位 (Capabilities)</label>
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">勾選即代表可排</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1 custom-scrollbar bg-slate-50 rounded-lg border border-slate-100">
                                {availableStations.map(station => {
                                    const isSelected = formData.capabilities.includes(station);
                                    return (
                                        <button
                                            key={station}
                                            type="button"
                                            onClick={() => toggleCapability(station)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all text-left ${
                                                isSelected 
                                                ? 'bg-teal-50 border-teal-200 text-teal-700 shadow-sm' 
                                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                            }`}
                                        >
                                            {isSelected ? <CheckSquare size={14} className="text-teal-600"/> : <Square size={14} className="text-gray-300"/>}
                                            <span className="truncate">{station}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Scheduling Constraints (Excluded Days) */}
                        <div>
                             <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">排班禁忌 (Excluded Days)</label>
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">勾選代表<span className="text-red-500 font-bold">不排班</span></span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {['日', '一', '二', '三', '四', '五', '六'].map((day, index) => {
                                    const isExcluded = formData.excludedDays.includes(index);
                                    return (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={() => toggleExcludedDay(index)}
                                            className={`w-8 h-8 rounded-lg text-sm font-bold border transition-all flex items-center justify-center ${
                                                isExcluded 
                                                ? 'bg-red-50 border-red-200 text-red-500 shadow-sm' 
                                                : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                                            }`}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Fixed Shifts */}
                        <div>
                             <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">固定排班設定 (Fixed Schedule)</label>
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">針對兼職醫師設定每週固定班表</span>
                            </div>
                            
                            {/* Add New Fixed Shift */}
                            <div className="flex flex-wrap gap-2 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <select 
                                    className="text-xs p-1.5 rounded border border-gray-300"
                                    value={newFixedShift.day}
                                    onChange={e => setNewFixedShift({...newFixedShift, day: parseInt(e.target.value)})}
                                >
                                    {['日', '一', '二', '三', '四', '五', '六'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                                </select>
                                <select 
                                    className="text-xs p-1.5 rounded border border-gray-300 flex-1 min-w-[80px]"
                                    value={newFixedShift.station}
                                    onChange={e => setNewFixedShift({...newFixedShift, station: e.target.value})}
                                >
                                    <option value="">選擇崗位...</option>
                                    {availableStations
                                        .filter(s => formData.capabilities.includes(s))
                                        .map(s => <option key={s} value={s}>{s}</option>)
                                    }
                                </select>
                                <select 
                                    className="text-xs p-1.5 rounded border border-gray-300 min-w-[60px]"
                                    value={newFixedShift.location}
                                    onChange={e => setNewFixedShift({...newFixedShift, location: e.target.value})}
                                >
                                    {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                                <div className="relative w-20">
                                    <Clock size={10} className="absolute left-1.5 top-2 text-gray-400"/>
                                    <input 
                                        type="text" 
                                        className="w-full pl-5 pr-1 py-1.5 text-xs border border-gray-300 rounded" 
                                        placeholder="08:30"
                                        value={newFixedShift.time}
                                        onChange={e => setNewFixedShift({...newFixedShift, time: e.target.value})}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddFixedShift}
                                    disabled={!newFixedShift.station}
                                    className="bg-teal-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-teal-700 disabled:opacity-50"
                                >
                                    +
                                </button>
                            </div>

                            {/* List */}
                            <div className="space-y-1">
                                {formData.fixedShifts.length === 0 ? (
                                    <div className="text-xs text-gray-400 italic text-center py-2">無固定班表</div>
                                ) : (
                                    formData.fixedShifts.map((shift, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-xs bg-white border border-gray-200 p-2 rounded shadow-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-gray-700 bg-slate-100 px-1.5 py-0.5 rounded">
                                                    週{['日', '一', '二', '三', '四', '五', '六'][shift.dayOfWeek]}
                                                </span>
                                                <span className="text-gray-800">{shift.station}</span>
                                                <span className="text-[10px] text-gray-500 bg-gray-50 px-1 rounded border border-gray-100">{shift.location}</span>
                                                {shift.workTime && <span className="text-gray-400 flex items-center gap-0.5"><Clock size={10}/>{shift.workTime}</span>}
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => handleRemoveFixedShift(idx)}
                                                className="text-gray-400 hover:text-red-500"
                                            >
                                                <Trash2 size={14}/>
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Weekday-Specific Settings */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">星期幾特殊設定 (Work Hours & Memos by Day)</label>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto bg-gradient-to-br from-purple-50/30 to-indigo-50/30 p-3 rounded-lg border border-purple-100">
                                {['週日', '週一', '週二', '週三', '週四', '週五', '週六'].map((dayName, dayIndex) => {
                                    const existing = formData.weekdaySettings.find(s => s.dayOfWeek === dayIndex);
                                    return (
                                        <div key={dayIndex} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-bold text-purple-700">{dayName}</span>
                                                {existing && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                weekdaySettings: prev.weekdaySettings.filter(s => s.dayOfWeek !== dayIndex)
                                                           }));
                                                        }}
                                                        className="text-xs text-red-500 hover:text-red-700"
                                                    >
                                                        清除
                                                    </button>
                                                )}
                                            </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="上班時間 (例: 08:00-16:00)"
                                                        value={existing?.workTime || ''}
                                                        onChange={(e) => {
                                                            const value = e.target.value;
                                                            setFormData(prev => {
                                                                const filtered = prev.weekdaySettings.filter(s => s.dayOfWeek !== dayIndex);
                                                                if (value || existing?.task) {
                                                                    return {
                                                                        ...prev,
                                                                        weekdaySettings: [...filtered, { dayOfWeek: dayIndex as any, workTime: value, task: existing?.task }]
                                                                    };
                                                                }
                                                                return { ...prev, weekdaySettings: filtered };
                                                            });
                                                        }}
                                                        className="text-xs p-2 border border-purple-200 rounded focus:border-purple-500 focus:outline-none"
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="任務 (例: 行政)"
                                                        value={existing?.task || ''}
                                                        onChange={(e) => {
                                                            const value = e.target.value;
                                                            setFormData(prev => {
                                                                const filtered = prev.weekdaySettings.filter(s => s.dayOfWeek !== dayIndex);
                                                                if (value || existing?.workTime) {
                                                                    return {
                                                                        ...prev,
                                                                        weekdaySettings: [...filtered, { dayOfWeek: dayIndex as any, workTime: existing?.workTime, task: value }]
                                                                    };
                                                                }
                                                                return { ...prev, weekdaySettings: filtered };
                                                            });
                                                        }}
                                                        className="text-xs p-2 border border-purple-200 rounded focus:border-purple-500 focus:outline-none"
                                                    />
                                                </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4 border-t border-gray-100">
                             {editingId && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg font-bold hover:bg-gray-200 transition-colors"
                                >
                                    取消
                                </button>
                            )}
                            <button
                                type="submit"
                                className={`flex-1 py-2.5 rounded-lg font-bold text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 ${
                                    editingId ? 'bg-teal-600 hover:bg-teal-700 shadow-teal-200' : 'bg-slate-800 hover:bg-slate-900 shadow-slate-300'
                                }`}
                            >
                                {editingId ? <Save size={18}/> : <Plus size={18}/>}
                                {editingId ? '儲存變更' : '新增醫師'}
                            </button>
                        </div>
                    </form>
                    
                    {/* Settings Quick Link */}
                     <div className="mt-8 pt-6 border-t border-gray-200">
                        <h3 className="text-xs font-bold text-gray-400 uppercase mb-3">崗位管理</h3>
                        <div className="flex gap-2 mb-3">
                            <input 
                                type="text"
                                value={newStationName}
                                onChange={e => setNewStationName(e.target.value)}
                                className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded outline-none"
                                placeholder="新增崗位名稱..."
                            />
                            <button 
                                onClick={handleAddStation}
                                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 rounded text-xs font-bold text-slate-700"
                            >
                                +
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                             {availableStations.map(s => (
                                 <div key={s} className="group flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded text-[10px] text-gray-600">
                                     {s}
                                     <button onClick={() => handleRemoveStation(s)} className="hidden group-hover:block text-red-400 hover:text-red-600 ml-1"><Trash2 size={10}/></button>
                                 </div>
                             ))}
                        </div>
                     </div>
                </div>
             </div>

             {/* Right Panel: List (Changed from Grid to Table) */}
             <div className="flex-1 overflow-y-auto p-6 md:p-8">
                <div className="max-w-6xl mx-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                            <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100">
                                <Users className="text-teal-600" size={24} />
                            </div>
                            醫師與崗位管理
                        </h1>
                        <span className="bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-xs font-bold">
                            共 {doctors.length} 位醫師
                        </span>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                                    <th className="px-6 py-4 font-bold">醫師姓名</th>
                                    <th className="px-6 py-4 font-bold">專科</th>
                                    <th className="px-6 py-4 font-bold">可排班地點</th>
                                    <th className="px-6 py-4 font-bold">可勝任崗位</th>
                                    <th className="px-6 py-4 font-bold">禁排日</th>
                                    <th className="px-6 py-4 font-bold">固定排班</th>
                                    <th className="px-6 py-4 font-bold text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {sortedDoctors.map(doc => {
                                    const isEditing = editingId === doc.id;
                                    return (
                                        <tr 
                                            key={doc.id}
                                            onClick={() => handleEdit(doc)}
                                            className={`group transition-all cursor-pointer hover:bg-slate-50/80 ${isEditing ? 'bg-teal-50/30' : ''}`}
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                     <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-sm border-2 border-white relative ${doc.isPartTime ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>
                                                        {doc.alias || doc.name[0]}
                                                        {doc.isPartTime && (
                                                            <div className="absolute -bottom-1 -right-1 bg-yellow-500 text-white text-[8px] px-1.5 py-0.5 rounded-full border border-white font-bold tracking-tighter">兼</div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-gray-800 flex items-center gap-2">
                                                            {doc.name}
                                                            {doc.isPartTime && <span className="text-[10px] text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-100">兼職</span>}
                                                        </div>
                                                        <div className="text-xs text-gray-400 font-mono mt-0.5">{doc.id.slice(0, 8)}...</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {doc.specialty ? (
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getSpecialtyColor(doc.specialty)}`}>
                                                        {doc.specialty}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300 text-sm">-</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {doc.locations && doc.locations.length > 0 ? (
                                                        doc.locations.map(loc => {
                                                            const isExcluded = doc.excludedAutoScheduleLocations?.includes(loc);
                                                            return (
                                                                <span key={loc} className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                                                                    isExcluded ? 'bg-gray-50 text-gray-500 border-gray-200' : 'bg-blue-50 text-blue-600 border-blue-100'
                                                                }`}>
                                                                    {loc}
                                                                </span>
                                                            );
                                                        })
                                                    ) : <span className="text-gray-300 text-xs">無</span>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                    {doc.capabilities && doc.capabilities.length > 0 ? (
                                                        doc.capabilities.slice(0, 5).map(cap => (
                                                            <span key={cap} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] border border-gray-200">
                                                                {cap}
                                                            </span>
                                                        ))
                                                    ) : <span className="text-gray-300 text-xs italic">未設定</span>}
                                                    {doc.capabilities && doc.capabilities.length > 5 && (
                                                        <span className="px-1.5 py-0.5 bg-gray-50 text-gray-400 rounded text-[10px]">+{doc.capabilities.length - 5}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {doc.excludedDays && doc.excludedDays.length > 0 ? (
                                                     <div className="flex gap-1">
                                                        {doc.excludedDays.map(d => (
                                                            <span key={d} className="w-5 h-5 flex items-center justify-center bg-red-50 text-red-500 rounded-full text-[10px] font-bold border border-red-100">
                                                                {['日', '一', '二', '三', '四', '五', '六'][d]}
                                                            </span>
                                                        ))}
                                                     </div>
                                                ) : <span className="text-gray-400 text-xs">無</span>}
                                            </td>
                                            <td className="px-6 py-4">
                                                {doc.fixedShifts && doc.fixedShifts.length > 0 ? (
                                                     <div className="flex flex-col gap-1">
                                                        {doc.fixedShifts.map((fs, i) => (
                                                            <div key={i} className="flex items-center gap-1.5 text-[10px]">
                                                                <span className="font-bold text-gray-600">
                                                                    {['日', '一', '二', '三', '四', '五', '六'][fs.dayOfWeek]}:
                                                                </span>
                                                                <div className="flex items-center gap-1 bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-gray-200">
                                                                    <span>{fs.station}</span>
                                                                    <span className="text-gray-400 text-[9px]">({fs.location})</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                     </div>
                                                ) : <span className="text-gray-300 text-xs">-</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                 <button 
                                                    onClick={(e) => { e.stopPropagation(); setDeleteTargetId(doc.id); }}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
             </div>

             {/* Delete Modal */}
             <ConfirmModal
                 isOpen={!!deleteTargetId}
                 title="刪除醫師"
                 message={`確定要刪除此醫師資料嗎？此操作將同時刪除所有相關的歷史排班紀錄，且無法復原。`}
                 onConfirm={handleDelete}
                 onClose={() => setDeleteTargetId(null)}
                 confirmText="確認刪除"
                 confirmColor="red"
             />
         </div>
    );
};

export default DoctorManagerPage;
