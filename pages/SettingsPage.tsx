
import React, { useState, useMemo } from 'react';
import { User, UserRole, RosterCycle, SYSTEM_OFF, StationDefault, Holiday, DateEventType } from '../types';
import { db } from '../services/store';
import { Plus, Trash2, Save, Settings, Calendar, AlertCircle, Users, Clock, Globe, X, RefreshCw, Key, UserCircle } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

interface SettingsPageProps {
  currentUser: User;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ currentUser }) => {
  const [stations, setStations] = useState<string[]>(db.getStations());
  const [requirements, setRequirements] = useState<Record<string, number[]>>(db.getStationRequirements());
  const [cycles, setCycles] = useState<RosterCycle[]>(db.getCycles());
  const [holidays, setHolidays] = useState<Holiday[]>(db.getHolidays());
  
  // Input states
  const [newStation, setNewStation] = useState('');
  const [newCycle, setNewCycle] = useState<Partial<RosterCycle>>({ name: '', startDate: '', endDate: '' });
  const [newHoliday, setNewHoliday] = useState<Partial<Holiday>>({ date: '', name: '', type: DateEventType.NATIONAL });
  const [cycleStartDate, setCycleStartDate] = useState(db.getCycleStartDate());
  
  // Password Change State
  const [passwordData, setPasswordData] = useState({ old: '', new: '', confirm: '' });
  
  // Confirm Modal State
  const [confirmState, setConfirmState] = useState<{
      type: 'station' | 'cycle' | 'holiday';
      id: string; // stationName, cycleId, or holidayDate
      title: string;
      message: string;
  } | null>(null);

  const isAdminOrSupervisor = currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN;

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
    setRequirements({...db.getStationRequirements()});
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
      switch(type) {
          case DateEventType.NATIONAL: return '國定假日';
          case DateEventType.MEETING: return '科會';
          case DateEventType.CLOSED: return '休診';
          default: return type;
      }
  };

  const getEventTypeColor = (type: DateEventType) => {
      switch(type) {
          case DateEventType.NATIONAL: return 'text-red-600 bg-red-100';
          case DateEventType.MEETING: return 'text-blue-600 bg-blue-100';
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
                        onChange={(e) => setPasswordData({...passwordData, old: e.target.value})}
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
                            onChange={(e) => setPasswordData({...passwordData, new: e.target.value})}
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
                            onChange={(e) => setPasswordData({...passwordData, confirm: e.target.value})}
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
        {isAdminOrSupervisor && (
        <>
            {/* Cycle Calculation Settings */}
            <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <RefreshCw size={16} className="text-gray-400" />
                    排班邏輯設定 (主管專用)
                </h3>
            </div>
            <div className="p-6">
                <label className="text-xs font-semibold text-gray-500 mb-2 block">四休二循環基準日</label>
                <div className="flex gap-2 items-center">
                    <input 
                        type="date"
                        value={cycleStartDate}
                        onChange={(e) => setCycleStartDate(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm"
                    />
                    <button 
                        onClick={handleUpdateCycleStartDate}
                        className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm"
                    >
                        更新設定
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                    設定此日期後，系統將以此日作為「四休二」循環的第一天 (Day 1) 開始計算所有人員的排班狀態。若您希望在 2026/1/1 重新開始計算，請在此調整。
                </p>
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
                            onChange={(e) => setNewCycle({...newCycle, name: e.target.value})}
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
                                onChange={(e) => setNewCycle({...newCycle, startDate: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                                required
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">結束日期</label>
                            <input 
                                type="date" 
                                value={newCycle.endDate}
                                onChange={(e) => setNewCycle({...newCycle, endDate: e.target.value})}
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
                    <form onSubmit={handleAddHoliday} className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            <input 
                                type="date" 
                                value={newHoliday.date}
                                onChange={(e) => setNewHoliday({...newHoliday, date: e.target.value})}
                                className="w-1/3 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                required
                            />
                            <input 
                                type="text" 
                                value={newHoliday.name}
                                onChange={(e) => setNewHoliday({...newHoliday, name: e.target.value})}
                                placeholder="名稱 (例: 科會)"
                                className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                required
                            />
                        </div>
                        <div className="flex gap-2">
                            <select
                                value={newHoliday.type}
                                onChange={(e) => setNewHoliday({...newHoliday, type: e.target.value as DateEventType})}
                                className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer bg-white"
                            >
                                <option value={DateEventType.NATIONAL}>國定假日 (紅字)</option>
                                <option value={DateEventType.MEETING}>科會 (藍字)</option>
                                <option value={DateEventType.CLOSED}>休診 (全員預設休假)</option>
                            </select>
                            <button type="submit" className="bg-gray-800 text-white px-6 rounded-lg hover:bg-gray-700 flex items-center justify-center">
                                <Plus size={16} />
                            </button>
                        </div>
                    </form>
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

            {/* Station Management */}
            <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit xl:col-span-2">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        崗位與人力需求 (主管專用)
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
                        <Plus size={16} className="mr-1"/> 新增
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
                            const reqs = requirements[station] || [0,0,0,0,0,0,0];
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
                <li>「科會」日期：僅作為行事曆標記，不影響排班邏輯。</li>
                <li>更新「循環基準日」會改變所有人四休二的計算起點。</li>
            </ul>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
