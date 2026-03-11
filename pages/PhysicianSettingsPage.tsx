
import React, { useState, useEffect } from 'react';
import { User, DoctorStationConfig, UserRole } from '../types';
import { db } from '../services/store';
import { Stethoscope, Plus, Pencil, X, Save, AlertCircle } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

const LOCATION_COLORS: Record<string, string> = {
    '北投': 'bg-blue-500 text-white',
    '大直': 'bg-[#A1887F] text-white', // Light Brown
    '台中': 'bg-orange-500 text-white',
    '外部': 'bg-purple-500 text-white'
};

interface PhysicianSettingsPageProps {
    currentUser: User;
}

const PhysicianSettingsPage: React.FC<PhysicianSettingsPageProps> = ({ currentUser }) => {
    if (currentUser.role !== UserRole.SYSTEM_ADMIN && currentUser.role !== UserRole.SCHEDULER && currentUser.role !== UserRole.PHYSICIAN_ADMIN) {
        return <div className="p-8 text-center text-gray-500">權限不足</div>;
    }

    // Physician Settings State
    const [doctorStations, setDoctorStations] = useState<DoctorStationConfig[]>(
        (db.settings.doctorStations || []).map(s => 
            typeof s === 'string' ? { name: s, location: '北投' } : s
        )
    );
    const [doctorWorkTime, setDoctorWorkTime] = useState(db.settings.defaultDoctorWorkTime || '08:30-17:30');
    const [doctorWorkTimeOptions, setDoctorWorkTimeOptions] = useState<string[]>(db.settings.doctorWorkTimeOptions || ['08:30-17:30', '08:00-12:00', '13:30-17:30']);
    const [newWorkTimeOption, setNewWorkTimeOption] = useState('');
    const [newDocStation, setNewDocStation] = useState('');
    const [newDocLocation, setNewDocLocation] = useState('北投');
    const [editingStation, setEditingStation] = useState<DoctorStationConfig | null>(null);
    const [editStationName, setEditStationName] = useState('');
    const [editStationLocation, setEditStationLocation] = useState('北投');
    const [doctorSpecialties, setDoctorSpecialties] = useState<string[]>(db.settings.doctorSpecialties || []);
    const [newSpecialty, setNewSpecialty] = useState('');
    const [confirmState, setConfirmState] = useState<{
        type: 'worktime' | 'station' | 'specialty';
        id: string;
        title: string;
        message: string;
        payload?: any;
    } | null>(null);
    
    // Requirements
    const [requirements, setRequirements] = useState<Record<string, number[]>>(db.getStationRequirements());
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

    // Migration for Doctor Stations (Legacy String -> Object)
    useEffect(() => {
        const current = db.settings.doctorStations || [];
        const hasLegacy = current.some(s => typeof s === 'string');
        if (hasLegacy) {
            const cleanStations = current.map(s => 
                typeof s === 'string' ? { name: s, location: '北投' } : s
            );
            db.settings.doctorStations = cleanStations;
            db.saveSettings();
            setDoctorStations(cleanStations);
        }
        
        const loadData = () => {
             setDoctorStations((db.settings.doctorStations || []).map(s => 
                 typeof s === 'string' ? { name: s, location: '北投' } : s
             ));
             setDoctorWorkTime(db.settings.defaultDoctorWorkTime || '08:30-17:30');
             setDoctorWorkTimeOptions(db.settings.doctorWorkTimeOptions || ['08:30-17:30', '08:00-12:00', '13:30-17:30']);
             setDoctorSpecialties(db.settings.doctorSpecialties || []);
             setRequirements(db.getStationRequirements());
        };

        const unsubscribe = db.subscribe(loadData);
        loadData();
        return () => unsubscribe();
    }, []);

    // Handlers
    const handleAddWorkTimeOption = (e: React.FormEvent) => {
        e.preventDefault();
        const time = newWorkTimeOption.trim();
        if (time && !doctorWorkTimeOptions.includes(time)) {
             const updated = [...doctorWorkTimeOptions, time];
             setDoctorWorkTimeOptions(updated);
             db.settings.doctorWorkTimeOptions = updated;
             db.saveSettings();
             setNewWorkTimeOption('');
        }
    };

    const handleRemoveWorkTimeOption = (time: string) => {
        if (doctorWorkTimeOptions.length <= 1) {
            alert('至少需保留一個時間選項');
            return;
        }
        setConfirmState({
            type: 'worktime',
            id: time,
            title: '移除時間選項',
            message: `確定要移除時間選項 "${time}" 嗎？`
        });
    };

    const handleSetDefaultWorkTime = (time: string) => {
         setDoctorWorkTime(time);
         db.settings.defaultDoctorWorkTime = time;
         db.saveSettings();
         // toast details logic could be here
    };

    const handleAddDocStation = (e: React.FormEvent) => {
        e.preventDefault();
        const name = newDocStation.trim();
        const location = newDocLocation || '北投';
        if (!name) return;

        if (doctorStations.some(s => s.name === name && s.location === location)) {
            alert(`崗位 "${name}" 在 "${location}" 已存在`);
            return;
        }

        const newConfig: DoctorStationConfig = { name, location };
        const newStations = [...doctorStations, newConfig];
        setDoctorStations(newStations);
        db.settings.doctorStations = newStations;
        db.saveSettings();
        setNewDocStation('');
    };

    const handleRemoveDocStation = (target: DoctorStationConfig) => {
        setConfirmState({
            type: 'station',
            id: '',
            title: '移除醫師崗位',
            message: `確定要移除醫師崗位 "${target.name}" (${target.location}) 嗎？`,
            payload: target
        });
    };

    const handleEditStationClick = (config: DoctorStationConfig) => {
        setEditingStation(config);
        setEditStationName(config.name);
        setEditStationLocation(config.location);
    };

    const handleUpdateStation = () => {
        const name = editStationName.trim();
        const location = editStationLocation;
        if (!name || !editingStation) return;

        // Check duplicates (excluding self)
        const isSelf = name === editingStation.name && location === editingStation.location;
        if (!isSelf && doctorStations.some(s => s.name === name && s.location === location)) {
            alert(`崗位 "${name}" 在 "${location}" 已存在`);
            return;
        }

        const updatedStations = doctorStations.map(s => 
            (s.name === editingStation.name && s.location === editingStation.location) ? { name, location } : s
        );

        setDoctorStations(updatedStations);
        db.settings.doctorStations = updatedStations;
        db.saveSettings();
        setEditingStation(null);
    };

    const handleAddSpecialty = (e: React.FormEvent) => {
        e.preventDefault();
        if (newSpecialty && !doctorSpecialties.includes(newSpecialty)) {
            const updated = [...doctorSpecialties, newSpecialty];
            setDoctorSpecialties(updated);
            db.settings.doctorSpecialties = updated;
            db.saveSettings();
            setNewSpecialty('');
        }
    };

    const handleRemoveSpecialty = (name: string) => {
        setConfirmState({
            type: 'specialty',
            id: name,
            title: '移除醫師專科',
            message: `確定要移除醫師專科 "${name}" 嗎？`
        });
    };

    const handleConfirmAction = () => {
        if (!confirmState) return;
        if (confirmState.type === 'worktime') {
            const time = confirmState.id;
            const updated = doctorWorkTimeOptions.filter(t => t !== time);
            setDoctorWorkTimeOptions(updated);
            db.settings.doctorWorkTimeOptions = updated;
            if (doctorWorkTime === time) {
                const newDefault = updated[0];
                setDoctorWorkTime(newDefault);
                db.settings.defaultDoctorWorkTime = newDefault;
            }
            db.saveSettings();
        } else if (confirmState.type === 'station') {
            const target: DoctorStationConfig = confirmState.payload;
            const newStations = doctorStations.filter(s => !(s.name === target.name && s.location === target.location));
            setDoctorStations(newStations);
            db.settings.doctorStations = newStations;
            db.saveSettings();
        } else if (confirmState.type === 'specialty') {
            const name = confirmState.id;
            const updated = doctorSpecialties.filter(s => s !== name);
            setDoctorSpecialties(updated);
            db.settings.doctorSpecialties = updated;
            db.saveSettings();
        }
        setConfirmState(null);
    };

    const handleRequirementChange = (stationKey: string, dayIndex: number, count: number) => {
        if (count < 0) return;
        // stationKey format: "Name_Location" or just "Name"
        // But db.updateStationRequirement expects just station name if unique?
        // Actually, looking at store.ts, `stationRequirements` is keyed by string.
        // For doctor stations, we need to be careful with keys.
        // The previous implementation used stationKey directly.
        
        db.updateStationRequirement(stationKey, dayIndex, count);
        setRequirements({ ...db.getStationRequirements() });
    };

    return (
        <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-64px)] overflow-y-auto pb-40">
            <ConfirmModal
                isOpen={!!confirmState}
                onClose={() => setConfirmState(null)}
                onConfirm={handleConfirmAction}
                title={confirmState?.title || ''}
                message={confirmState?.message || ''}
                confirmText="確定移除"
                confirmColor="red"
            />
             <div className="mb-6 flex items-center gap-3">
                <div className="p-2.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <Stethoscope className="text-indigo-600" size={24} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-gray-800">醫師排班設定</h2>
                    <p className="text-sm text-gray-500">設定醫師專屬的崗位、專科與人力需求</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                <div className="px-6 py-4 border-b border-gray-100 bg-indigo-50/50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Stethoscope size={16} className="text-indigo-600" />
                        醫師排班設定 (Physician Schedule)
                    </h3>
                </div>
                <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column: Settings */}
                    <div className="space-y-6">
                        {/* Default Work Time */}
                            <label className="text-xs font-bold text-gray-500 mb-2 block">預設上班時間 (Set Default)</label>
                            <p className="text-[10px] text-gray-400 mb-3 bg-indigo-50 p-2 rounded text-indigo-700 border border-indigo-100">
                                點擊時間即可設為「預設值」（將用於自動排班）。
                            </p>

                            <div className="flex gap-2 mb-3">
                                <input
                                    type="text"
                                    value={newWorkTimeOption}
                                    onChange={(e) => setNewWorkTimeOption(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                                    placeholder="新增時間 (e.g. 08:30-17:30)"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddWorkTimeOption}
                                    className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
                                >
                                    <Plus size={14} /> 新增
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {doctorWorkTimeOptions.map(time => (
                                    <div 
                                        key={time} 
                                        onClick={() => handleSetDefaultWorkTime(time)}
                                        className={`group flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm cursor-pointer transition-all ${
                                            doctorWorkTime === time 
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                                            : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'
                                        }`}
                                    >
                                        <span className="font-medium">{time}</span>
                                        {doctorWorkTime === time && <span className="text-[10px] bg-white/20 px-1.5 rounded">Default</span>}
                                        
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleRemoveWorkTimeOption(time); }}
                                            className={`opacity-20 group-hover:opacity-100 transition-opacity p-0.5 rounded-full ${
                                                doctorWorkTime === time ? 'hover:bg-indigo-500 text-white' : 'hover:bg-red-100 hover:text-red-500 text-gray-400'
                                            }`}
                                            title="移除"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        
                        <div className="border-t border-gray-100 lg:hidden"></div>

                        {/* Doctor Stations */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">醫師崗位管理 (Doctor Stations)</label>
                            <p className="text-[10px] text-gray-400 mb-3 bg-indigo-50 p-2 rounded text-indigo-700 border border-indigo-100">
                                請設定崗位名稱與其所屬地點 (北投/大直/台中)。系統將依地點分配至對應區塊。
                            </p>
                            
                            <div className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    value={newDocStation}
                                    onChange={(e) => setNewDocStation(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="新增崗位名稱..."
                                />
                                <select
                                    value={newDocLocation}
                                    onChange={(e) => setNewDocLocation(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="北投">北投</option>
                                    <option value="大直">大直</option>
                                    <option value="台中">台中</option>
                                    <option value="外部">外部</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={handleAddDocStation}
                                    className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
                                >
                                    <Plus size={14} /> 新增
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {[...doctorStations].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')).map(config => (
                                    <div key={`${config.name}-${config.location}`} className="group flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all">
                                        <span>{config.name}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${LOCATION_COLORS[config.location] || 'bg-gray-400 text-white'}`}>
                                            {config.location}
                                        </span>
                                        <div className="flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity border-l border-gray-200 pl-2 ml-1">
                                            <button
                                                onClick={() => handleEditStationClick(config)}
                                                className="text-gray-400 hover:text-indigo-500 transition-colors p-0.5"
                                                title="編輯"
                                            >
                                                <Pencil size={12} />
                                            </button>
                                            <button
                                                onClick={() => handleRemoveDocStation(config)}
                                                className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
                                                title="移除"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="border-t border-gray-100 lg:hidden"></div>

                        {/* Doctor Specialties */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">醫師專科設定 (Doctor Specialties)</label>
                            <p className="text-[10px] text-gray-400 mb-3 bg-indigo-50 p-2 rounded text-indigo-700 border border-indigo-100">
                                設定醫師的可選專科 (如：家醫科、腸胃科、影像醫學部)。
                            </p>
                            
                            <div className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    value={newSpecialty}
                                    onChange={(e) => setNewSpecialty(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="新增專科名稱..."
                                />
                                <button
                                    type="button"
                                    onClick={handleAddSpecialty}
                                    className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
                                >
                                    <Plus size={14} /> 新增
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {doctorSpecialties.map(spec => (
                                    <div key={spec} className="group flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all">
                                        <span>{spec}</span>
                                        <button
                                            onClick={() => handleRemoveSpecialty(spec)}
                                            className="opacity-20 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Requirements */}
                    <div>
                         <div className="border-t border-gray-100 my-6 lg:hidden"></div>
                        
                         <h4 className="font-bold text-gray-700 text-sm mb-3">醫師崗位人力需求 (Doctor Requirements)</h4>
                        <p className="text-[10px] text-gray-400 mb-2">設定每天（週日～週六）該崗位需要的人數。</p>
                        <div className="overflow-x-auto max-h-[500px] border border-gray-200 rounded-lg shadow-sm">
                            <table className="w-full text-xs text-center border-collapse">
                                <thead className="sticky top-0 z-10 shadow-sm">
                                    <tr className="bg-gray-50 text-gray-700 font-bold">
                                        <th className="px-3 py-2 border-b border-gray-200 text-left min-w-[90px] bg-gray-50">崗位</th>
                                        {weekDays.map((d, i) => (
                                            <th key={i} className={`px-2 py-2 border-b border-gray-200 w-14 ${i === 0 || i === 6 ? 'text-red-500 bg-red-50/50' : 'bg-gray-50'}`}>{d}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white">
                                    {['北投', '大直', '台中', '外部'].map(location => {
                                        const locStations = doctorStations
                                            .filter(s => s.location === location)
                                            .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
                                        if (locStations.length === 0) return null;

                                        return (
                                            <React.Fragment key={location}>
                                                {/* Location Header */}
                                                <tr className="bg-indigo-50/30">
                                                    <td colSpan={8} className="px-3 py-1.5 text-left font-bold text-indigo-700 text-xs border-b border-gray-100 flex items-center gap-2">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${LOCATION_COLORS[location]}`}></span>
                                                        {location}區
                                                    </td>
                                                </tr>
                                                
                                                {/* Station Rows */}
                                                {locStations.map(config => {
                                                    const stationKey = `${config.name}_${config.location}`;
                                                    const reqs = requirements[stationKey] || requirements[config.name] || [0, 0, 0, 0, 0, 0, 0];
                                                    return (
                                                        <tr key={stationKey} className="group hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                                                            <td className="px-3 py-2 text-left font-medium text-gray-700 border-r border-gray-50">
                                                                {config.name}
                                                            </td>
                                                            {reqs.map((count, dayIdx) => (
                                                                <td key={dayIdx} className={`p-1 ${dayIdx === 0 || dayIdx === 6 ? 'bg-red-50/5' : ''}`}>
                                                                    <div className="relative flex justify-center">
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            max="10"
                                                                            value={count}
                                                                            onChange={(e) => handleRequirementChange(stationKey, dayIdx, parseInt(e.target.value) || 0)}
                                                                            className="w-10 text-center py-1.5 rounded-md text-gray-600 font-medium bg-transparent hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:text-indigo-600 outline-none transition-all cursor-default focus:cursor-text"
                                                                        />
                                                                    </div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

             {/* Edit Station Modal */}
            {editingStation && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                    <div className="bg-white rounded-xl shadow-2xl w-96 p-6 animate-in fade-in zoom-in duration-200">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Pencil size={18} className="text-indigo-600"/> 編輯崗位
                        </h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">崗位名稱 (Name)</label>
                                <input
                                    type="text"
                                    value={editStationName}
                                    onChange={(e) => setEditStationName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">所屬地點 (Location)</label>
                                <select
                                    value={editStationLocation}
                                    onChange={(e) => setEditStationLocation(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                >
                                    <option value="北投">北投</option>
                                    <option value="大直">大直</option>
                                    <option value="台中">台中</option>
                                    <option value="外部">外部</option>
                                </select>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => setEditingStation(null)}
                                    className="flex-1 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm font-bold transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleUpdateStation}
                                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
                                >
                                    儲存
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhysicianSettingsPage;
