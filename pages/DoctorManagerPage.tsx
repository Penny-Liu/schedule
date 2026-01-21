import React, { useState } from 'react';
import { db } from '../services/store';
import { Doctor, UserRole } from '../types';
import { Users, Plus, Trash2, Edit2, Save, X, Settings } from 'lucide-react';

interface DoctorManagerPageProps {
    currentUser: any;
}

const DoctorManagerPage: React.FC<DoctorManagerPageProps> = ({ currentUser }) => {
    const [doctors, setDoctors] = useState<Doctor[]>(db.getDoctors());
    const [newDoctorName, setNewDoctorName] = useState('');
    const [newDoctorAlias, setNewDoctorAlias] = useState('');
    const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
    const [isStationSettingsOpen, setIsStationSettingsOpen] = useState(false);
    const [stations, setStations] = useState<string[]>(db.settings.doctorStations || ['影像', '遠', '支援']);
    const [newStation, setNewStation] = useState('');

    // Reload doctors on change
    React.useEffect(() => {
        const unsubscribe = db.subscribe(() => {
            setDoctors([...db.getDoctors()]);
            setStations(db.settings.doctorStations || ['影像', '遠', '支援']);
        });
        return unsubscribe;
    }, []);

    const handleAddDoctor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDoctorName.trim()) return;
        await db.addDoctor(newDoctorName.trim(), newDoctorAlias.trim());
        setNewDoctorName('');
        setNewDoctorAlias('');
        alert('醫師已新增');
    };

    const handleUpdateDoctor = async () => {
        if (!editingDoctor || !editingDoctor.name.trim()) return;
        await db.updateDoctor(editingDoctor);
        setEditingDoctor(null);
    };

    const handleDeleteDoctor = async (id: string) => {
        if (confirm('確定要刪除這位醫師嗎？相關排班資料也會一併刪除。')) {
            const { error } = await db.deleteDoctor(id);
            if (error) {
                alert('刪除失敗，請稍後再試');
                console.error(error);
                // Force reload to restore state
                document.location.reload(); 
            }
        }
    };

    const handleSaveStations = async () => {
        db.settings.doctorStations = stations;
        await db.saveSettings();
        setIsStationSettingsOpen(false);
        alert('崗位設定已儲存');
    };

    const addStation = () => {
        if (newStation && !stations.includes(newStation)) {
            setStations([...stations, newStation]);
            setNewStation('');
        }
    };

    const removeStation = (station: string) => {
        setStations(stations.filter(s => s !== station));
    };

    if (currentUser.role !== UserRole.SYSTEM_ADMIN) {
        return <div className="p-8 text-center text-gray-500">權限不足</div>;
    }

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <Users className="text-teal-600" />
                    醫師管理
                </h1>
                <button
                    onClick={() => setIsStationSettingsOpen(!isStationSettingsOpen)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                >
                    <Settings size={18} />
                    設定醫師崗位
                </button>
            </div>

            {/* Station Settings Panel */}
            {isStationSettingsOpen && (
                <div className="mb-8 bg-slate-50 p-6 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-4">
                    <h2 className="text-lg font-bold mb-4 text-slate-700">醫師崗位設定</h2>
                     <div className="flex gap-2 mb-4">
                        <input
                            type="text"
                            value={newStation}
                            onChange={e => setNewStation(e.target.value)}
                            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg"
                            placeholder="輸入新崗位名稱"
                        />
                        <button onClick={addStation} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
                            新增
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {stations.map(station => (
                            <div key={station} className="bg-white px-3 py-1 rounded-full border border-slate-200 flex items-center gap-2 shadow-sm">
                                <span>{station}</span>
                                <button onClick={() => removeStation(station)} className="text-red-400 hover:text-red-600">
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                     <div className="mt-4 flex justify-end">
                        <button onClick={handleSaveStations} className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900">
                            儲存變更
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Add Doctor Form */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                    <h2 className="text-lg font-bold mb-4 text-gray-700 flex items-center gap-2">
                        <Plus size={20} className="text-teal-500" />
                        新增醫師
                    </h2>
                    <form onSubmit={handleAddDoctor} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                            <input
                                type="text"
                                value={newDoctorName}
                                onChange={(e) => setNewDoctorName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none mb-2"
                                placeholder="請輸入醫師姓名"
                                required
                            />
                            <label className="block text-sm font-medium text-gray-700 mb-1">代號 (顯示用)</label>
                            <input
                                type="text"
                                value={newDoctorAlias}
                                onChange={(e) => setNewDoctorAlias(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                                placeholder="例如：錢"
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 transition font-medium"
                        >
                            新增
                        </button>
                    </form>
                </div>

                {/* Doctor List */}
                <div className="md:col-span-2 space-y-4">
                    <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2">
                        現有醫師名單
                        <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            {doctors.length} 位
                        </span>
                    </h2>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        {doctors.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">目前沒有醫師資料</div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {doctors.map((doctor) => (
                                    <div key={doctor.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition">
                                        {editingDoctor?.id === doctor.id ? (
                                            <div className="flex items-center gap-2 flex-1 mr-4">
                                                <input
                                                    type="text"
                                                    value={editingDoctor.name}
                                                    onChange={(e) => setEditingDoctor({ ...editingDoctor, name: e.target.value })}
                                                    className="flex-1 px-3 py-1 border border-teal-200 rounded outline-none focus:ring-2 focus:ring-teal-500"
                                                    placeholder="姓名"
                                                    autoFocus
                                                />
                                                <input
                                                    type="text"
                                                    value={editingDoctor.alias || ''}
                                                    onChange={(e) => setEditingDoctor({ ...editingDoctor, alias: e.target.value })}
                                                    className="w-20 px-3 py-1 border border-teal-200 rounded outline-none focus:ring-2 focus:ring-teal-500"
                                                    placeholder="代號"
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-teal-50 text-teal-700 rounded-full flex items-center justify-center font-bold">
                                                    {doctor.alias || doctor.name.slice(0, 1)}
                                                </div>
                                                <span className="font-medium text-gray-800">
                                                    {doctor.name}
                                                    {doctor.alias && <span className="text-gray-400 text-sm ml-2">({doctor.alias})</span>}
                                                </span>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2">
                                            {editingDoctor?.id === doctor.id ? (
                                                <>
                                                    <button
                                                        onClick={handleUpdateDoctor}
                                                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                                                        title="儲存"
                                                    >
                                                        <Save size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingDoctor(null)}
                                                        className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition"
                                                        title="取消"
                                                    >
                                                        <X size={18} />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => setEditingDoctor(doctor)}
                                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                        title="編輯"
                                                    >
                                                        <Edit2 size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteDoctor(doctor.id)}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                        title="刪除"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DoctorManagerPage;
