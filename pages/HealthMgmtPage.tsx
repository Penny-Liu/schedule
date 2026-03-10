import React, { useState, useEffect, useMemo } from 'react';
import { User, Shift, HealthMgmtShift, UserRole, PERMISSIONS, StaffGroup, HealthMgmtStaff, RosterCycle } from '../types';
import { db } from '../services/store';
import { Users, LayoutDashboard, Calendar, ArrowLeft, ArrowRight, X, Lock, Unlock, UserPlus, Save, Trash2, FileSpreadsheet, BarChart3, Download, Search } from 'lucide-react';
import { toLocalISOString, generateUUID } from '../services/utils';
import ConfirmModal from '../components/ConfirmModal';
import { utils, writeFile } from 'xlsx';

interface HealthMgmtPageProps {
  currentUser: User;
}



const HealthMgmtPage: React.FC<HealthMgmtPageProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'staff' | 'stats'>('schedule');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<HealthMgmtShift[]>([]);
  const [hmStations, setHmStations] = useState<string[]>(db.getHealthMgmtStations());
  const [healthMgmtUsers, setHealthMgmtUsers] = useState<User[]>([]);
  const [healthMgmtStaff, setHealthMgmtStaff] = useState<HealthMgmtStaff[]>([]); // Changed from healthMgmtUsers
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [hmTasks, setHmTasks] = useState<string[]>(db.getHealthMgmtTasks());
  const [hmCycles, setHmCycles] = useState<RosterCycle[]>(db.getHealthMgmtCycles());

  const [newStaffName, setNewStaffName] = useState(''); // For adding new staff
  const [newStaffAlias, setNewStaffAlias] = useState(''); // For adding new staff alias
  const [editingStaffName, setEditingStaffName] = useState(''); // For editing existing staff name
  const [editingStaffAlias, setEditingStaffAlias] = useState(''); // For editing existing staff alias
  const [editingStaffIsActive, setEditingStaffIsActive] = useState(true); // For editing existing staff active status

  // Inline Popup State
  const [selectedCell, setSelectedCell] = useState<{ userId: string; date: string } | null>(null);
  const [editingShiftTime, setEditingShiftTime] = useState('');
  const [editingShiftTask, setEditingShiftTask] = useState(''); // This will map to 'station' (H, G, etc)
  const [editingShiftSubTask, setEditingShiftSubTask] = useState(''); // This will map to 'task' (主控, 輔控, etc)
  const [editingShiftCustomTask, setEditingShiftCustomTask] = useState('');

  // Quick Schedule State
  const [isQuickScheduleMode, setIsQuickScheduleMode] = useState(false);
  const [quickScheduleStation, setQuickScheduleStation] = useState('');
  const [quickScheduleTask, setQuickScheduleTask] = useState('');
  const [selectedCycleId, setSelectedCycleId] = useState<string>('month');

  const isReadOnly = (currentUser.role === UserRole.VIEWER || currentUser.role === UserRole.EMPLOYEE) && !currentUser.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT);

  // Filtered staff list based on reactive state
  const activeStaff = useMemo(() => {
      return healthMgmtStaff.filter(s => s.isActive !== false);
  }, [healthMgmtStaff]);

  // State for local modifications (if needed, but for this change, direct DB updates are used)
  // const [localStaff, setLocalStaff] = useState<HealthMgmtStaff[]>([]);

  useEffect(() => {
    const loadData = () => {
      setHealthMgmtStaff(db.getHealthMgmtStaff());
      setShifts(db.getHealthMgmtShifts());
      setHmStations(db.getHealthMgmtStations());
      setHmTasks(db.getHealthMgmtTasks());
      setHmCycles(db.getHealthMgmtCycles());
    };
    loadData();
    const unsubscribe = db.subscribe(loadData);
    return () => unsubscribe();
  }, []);

  const currentCycle = useMemo(() => {
    return hmCycles.find(c => c.id === selectedCycleId);
  }, [selectedCycleId, hmCycles]);

  const dateRange = useMemo(() => {
    if (selectedCycleId !== 'month' && currentCycle) {
        const dates = [];
        const start = new Date(currentCycle.startDate);
        const end = new Date(currentCycle.endDate);
        if (start <= end) {
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                dates.push(toLocalISOString(d));
            }
            return dates;
        }
    }

    const dates = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        dates.push(toLocalISOString(d));
    }
    return dates;
  }, [currentDate, selectedCycleId, currentCycle]);

  const handleUpdateShift = async (userId: string, date: string, station: string, task?: string) => {
    if (isReadOnly) return;
    const existing = shifts.find(s => s.userId === userId && s.date === date);
    
    if (existing) {
        if (!station && !task) {
            await db.deleteHealthMgmtShift(userId, date);
        } else {
            await db.upsertHealthMgmtShift({ ...existing, station: station || '', task });
        }
    } else if (station || task) {
        const newShift: HealthMgmtShift = {
            id: generateUUID(),
            userId,
            date,
            station: station || '',
            task
        };
        await db.upsertHealthMgmtShift(newShift);
    }
  };

  const handleCellClick = async (userId: string, date: string) => {
      if (isReadOnly) return;
      
      if (isQuickScheduleMode) {
          // Quick apply
          // Use quickScheduleStation or quickScheduleTask
          await handleUpdateShift(userId, date, quickScheduleStation, quickScheduleTask || undefined);
      } else {
          // Open Inline Popup
          setSelectedCell({ userId, date });
          const existing = shifts.find(s => s.userId === userId && s.date === date);
          if (existing) {
              // Extract station and optional time
              if (existing.station) {
                  const parts = existing.station.split(' ');
                  if (parts.length > 1 && parts[0].includes(':')) {
                      setEditingShiftTime(parts[0]);
                      setEditingShiftTask(parts.slice(1).join(' ')); // This is 'station' (崗位)
                  } else {
                      setEditingShiftTime('');
                      setEditingShiftTask(existing.station);
                  }
              } else {
                  setEditingShiftTime('');
                  setEditingShiftTask('');
              }
              setEditingShiftSubTask(existing.task || ''); // This is 'task' (任務)
          } else {
              setEditingShiftTime('');
              setEditingShiftTask('');
              setEditingShiftSubTask('');
          }
      }
  };

  const handleSavePopup = async () => {
      if (!selectedCell) return;
      
      let finalStation = editingShiftTask;
      if (editingShiftTime) {
          finalStation = (`${editingShiftTime} ${editingShiftTask}`).trim();
      }

      const finalTask = editingShiftCustomTask || editingShiftSubTask;

      await handleUpdateShift(selectedCell.userId, selectedCell.date, finalStation, finalTask || undefined);
      setSelectedCell(null);
      setEditingShiftCustomTask('');
  };

  const handleExportStats = () => {
      const label = selectedCycleId === 'month' 
        ? toLocalISOString(currentDate).substring(0, 7) 
        : currentCycle?.name || '週期統計';
      
      const data = activeStaff.map(staff => {
          const row: any = { '姓名': staff.name };
          let total = 0;
          
          hmStations.forEach(st => {
              const count = shifts.filter(s => {
                  if (s.userId !== staff.id || !dateRange.includes(s.date)) return false;
                  // Handle "08:00-16:00 主控" format
                  const parts = s.station.split(' ');
                  const task = parts.length > 1 ? parts.slice(1).join(' ') : s.station;
                  return task === st;
              }).length;
              row[st] = count;
              total += count;
          });
          
          row['總計天數'] = total;
          return row;
      });

      const ws = utils.json_to_sheet(data);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "健管排班統計");
      writeFile(wb, `健管排班統計_${label}.xlsx`);
  };

  const stats = useMemo(() => {
    return activeStaff.map(staff => {
        const counts: Record<string, number> = {};
        let total = 0;
        hmStations.forEach(st => {
            const count = shifts.filter(s => {
                if (s.userId !== staff.id || !dateRange.includes(s.date)) return false;
                const parts = s.station.split(' ');
                const task = parts.length > 1 ? parts.slice(1).join(' ') : s.station;
                return task === st;
            }).length;
            counts[st] = count;
            total += count;
        });
        return { staff, counts, total };
    });
  }, [activeStaff, hmStations, shifts, dateRange]);

  // Function to add new HM staff
  const addStaff = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isReadOnly) return;
      if (!newStaffName.trim()) {
          setError('請輸入人員名稱');
          return;
      }
      setError(null);
      setIsSaving(true);
      try {
          const newStaff: HealthMgmtStaff = {
              id: generateUUID(),
              name: newStaffName.trim(),
              alias: newStaffAlias.trim() || undefined,
              isActive: true
          };
          await db.addHealthMgmtStaff(newStaff);
          setNewStaffName('');
          setNewStaffAlias('');
      } catch (err: any) {
          setError(err.message || '新增失敗，請重試');
      } finally {
          setIsSaving(false);
      }
  };

  // Function to update staff name and active status
  const updateStaff = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isReadOnly) return;
      if (!editingId || !editingStaffName.trim()) {
          setError('請輸入人員名稱');
          return;
      }
      setError(null);
      setIsSaving(true);
      try {
          await db.updateHealthMgmtStaff(editingId, { 
              name: editingStaffName.trim(), 
              alias: editingStaffAlias.trim() || undefined,
              isActive: editingStaffIsActive 
          });
          setEditingId(null);
          setEditingStaffName('');
          setEditingStaffAlias('');
          setEditingStaffIsActive(true);
      } catch (err: any) {
          setError(err.message || '更新失敗，請重試');
      } finally {
          setIsSaving(false);
      }
  };

   const handleEditStaff = (staff: HealthMgmtStaff) => {
    if (isReadOnly) return;
    setEditingId(staff.id);
    setEditingStaffName(staff.name);
    setEditingStaffAlias(staff.alias || '');
    setEditingStaffIsActive(staff.isActive);
    setActiveTab('staff');
  };

  const handleDeleteStaff = async () => {
    if (isReadOnly) return;
    if (deleteTargetId) {
      await db.updateHealthMgmtStaff(deleteTargetId, { isActive: false }); // Deactivate instead of delete
      setDeleteTargetId(null);
    }
  };

  const canEdit = currentUser.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT) || currentUser.role === UserRole.SYSTEM_ADMIN;

  return (
    <div className="p-4 w-full h-screen overflow-y-auto bg-slate-50">
      <ConfirmModal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleDeleteStaff}
        title="確認停用健管人員"
        message="停用後該人員將不會出現在排班選單中，但歷史資料會保留。"
        confirmText="確認停用"
        confirmColor="red"
      />

      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <LayoutDashboard className="text-teal-600" size={24} />
            健管業務管理
          </h2>
          <p className="text-sm text-gray-500">管理健管人員名單與每日排班</p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('schedule')}
            className={"px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 " + (
              activeTab === 'schedule' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Calendar size={16} /> 排班總覽
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={"px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 " + (
              activeTab === 'stats' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <BarChart3 size={16} /> 統計數據
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={"px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 " + (
              activeTab === 'staff' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Users size={16} /> 健管人員管理
          </button>
        </div>
      </div>

      {activeTab === 'schedule' ? (
        <>
          <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-sm border">
                <button onClick={() => {
                  const prev = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                  setCurrentDate(prev);
                }} className="p-2 hover:bg-gray-50 rounded-lg text-gray-500 transition-colors">
                  <ArrowLeft size={18} />
                </button>
                <div className="px-4 py-1 text-sm font-bold text-gray-700 min-w-[150px] text-center">
                  {currentDate.getFullYear()} 年 {currentDate.getMonth() + 1} 月
                </div>
                <button onClick={() => {
                  const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
                  setCurrentDate(next);
                }} className="p-2 hover:bg-gray-50 rounded-lg text-gray-500 transition-colors">
                  <ArrowRight size={18} />
                </button>
              </div>

              {hmCycles.length > 0 && (
                <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border px-3">
                  <Calendar size={16} className="text-teal-600" />
                  <select 
                    className="text-sm font-bold text-gray-700 bg-transparent border-none outline-none focus:ring-0 cursor-pointer"
                    onChange={(e) => setSelectedCycleId(e.target.value)}
                    value={selectedCycleId}
                  >
                    <option value="month">按月份檢視</option>
                    <optgroup label="自定義週期">
                      {hmCycles.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              )}
            </div>

            {/* Quick Schedule Toolbar */}
            {!isReadOnly && (
                <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-gray-200">
                    <button
                        onClick={() => setIsQuickScheduleMode(!isQuickScheduleMode)}
                        className={"px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 " + (isQuickScheduleMode ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50')}
                        title="開啟後，點擊格子可快速填寫所選任務"
                    >
                        快速排班 {isQuickScheduleMode ? 'ON' : 'OFF'}
                    </button>
                    
                    {isQuickScheduleMode && (
                        <div className="flex flex-col gap-2 pl-2 border-l border-gray-200 overflow-x-auto max-w-[800px] no-scrollbar">
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400 font-bold mr-2 whitespace-nowrap">崗位：</span>
                                {[...hmStations, '清除'].map(st => (
                                    <button
                                        key={st}
                                        onClick={() => {
                                            if (st === '清除') {
                                                setQuickScheduleStation('');
                                                setQuickScheduleTask('');
                                            } else {
                                                setQuickScheduleStation(st);
                                            }
                                        }}
                                        className={"px-2 py-0.5 rounded text-[10px] font-bold transition-colors border whitespace-nowrap " + (quickScheduleStation === st || (st === '清除' && !quickScheduleStation && !quickScheduleTask)
                                                ? st === '清除' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-teal-600 text-white border-teal-700'
                                                : st === '清除' ? 'bg-white text-red-600 border-red-200 hover:bg-red-50' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                        )}
                                    >
                                        {st}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400 font-bold mr-2 whitespace-nowrap">任務：</span>
                                {hmTasks.map(tk => (
                                    <button
                                        key={tk}
                                        onClick={() => setQuickScheduleTask(tk === quickScheduleTask ? '' : tk)}
                                        className={"px-2 py-0.5 rounded text-[10px] font-bold transition-colors border whitespace-nowrap " + (quickScheduleTask === tk 
                                                ? 'bg-indigo-600 text-white border-indigo-700'
                                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                        )}
                                    >
                                        {tk}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm inline-block min-w-full">
            <table className="text-sm border-collapse w-auto">
              <thead className="relative z-50">
                <tr className="bg-slate-50 backdrop-blur border-b border-slate-200">
                  <th className="p-3 text-left font-bold text-slate-600 w-32 sticky left-0 top-0 bg-slate-50 backdrop-blur z-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">人員</th>
                  {dateRange.map(date => {
                      const d = new Date(date);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const isToday = date === toLocalISOString(new Date());

                      return (
                          <th 
                              key={date} 
                              className={"px-0.5 py-0.5 text-center border-r border-slate-100 min-w-[40px] sticky top-0 z-50 " + (isToday ? 'bg-teal-50' : (isWeekend ? 'bg-red-50' : 'bg-white')) + " border-b border-slate-200"}
                          >
                              <div className={"font-bold text-[11px] leading-tight " + (isToday ? 'text-teal-600' : (isWeekend ? 'text-red-500' : 'text-slate-800'))}>{d.getMonth() + 1}/{d.getDate()}</div>
                              <div className={"text-[10px] opacity-75 leading-tight " + (isToday ? 'text-teal-600' : (isWeekend ? 'text-red-500' : 'text-slate-700'))}>
                                  {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
                              </div>
                          </th>
                      );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeStaff.map(staff => (
                  <tr key={staff.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="p-0 border-r border-slate-200 sticky left-0 bg-white z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        <div className="p-3 font-bold text-slate-800 flex items-center min-w-[128px]">
                            {staff.name}
                        </div>
                    </td>
                    {dateRange.map(date => {
                        const shift = shifts.find(s => s.userId === staff.id && s.date === date);
                        const hasContent = shift && (shift.station || shift.task);
                        
                        let time = '';
                        let displayStation = '';
                        let displayTask = shift?.task || '';

                        if (shift?.station) {
                            const parts = shift.station.split(' ');
                            if (parts.length > 1 && parts[0].includes(':')) {
                                time = parts[0];
                                displayStation = parts.slice(1).join(' ');
                            } else {
                                displayStation = shift.station;
                            }
                        }

                        // Determine cell style like PhysicianSchedulePage
                        let cellBg = 'hover:bg-gray-50';
                        if (isQuickScheduleMode) {
                            cellBg = (quickScheduleStation || quickScheduleTask) ? 'hover:bg-indigo-50' : 'hover:bg-red-50';
                        } else if (hasContent) {
                            if (displayStation.includes('行政')) cellBg = 'bg-white hover:bg-gray-50';
                            else if (displayTask.includes('主控') || displayStation.includes('主控')) cellBg = 'bg-teal-100 hover:bg-teal-200';
                            else if (displayTask.includes('排班') || displayStation.includes('排班')) cellBg = 'bg-blue-100 hover:bg-blue-200';
                            else if (displayTask.includes('晚班') || displayStation.includes('晚班')) cellBg = 'bg-[#D7CCC8] hover:bg-[#BCAAA4]';
                            else if (displayTask.includes('call') || displayStation.includes('call')) cellBg = 'bg-yellow-100 hover:bg-yellow-200';
                            else cellBg = 'bg-teal-50 hover:bg-teal-100'; // Default assigned
                        }

                        return (
                          <td 
                            key={date} 
                            onClick={() => handleCellClick(staff.id, date)}
                            className={"p-1 border-r border-gray-100 h-16 transition-colors text-center " + (!isReadOnly ? 'cursor-pointer' : 'cursor-default') + " " + cellBg}
                          >
                             {hasContent ? (
                                <div className="h-full w-full flex flex-col items-center justify-center p-0 overflow-hidden">
                                     <div className="flex flex-col items-center justify-center space-y-0.5 w-full" style={{ transform: 'scale(0.95)', transformOrigin: 'center center' }}>
                                         <span className={"font-bold block text-sm leading-tight text-center " + (displayTask.includes('晚班') || displayTask.includes('主控') ? 'text-teal-800' : 'text-slate-700')}>
                                             {displayStation}
                                         </span>
                                         {displayTask && (
                                             <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1 rounded whitespace-nowrap">
                                                 {displayTask}
                                             </span>
                                         )}
                                         {time && (
                                            <span className="text-[10px] text-slate-500 leading-tight font-medium font-mono">
                                                {time.replace(/(\d{1,2}):(\d{2})/g, (match, h, m) => m === '00' ? String(parseInt(h)) : parseInt(h) + "'").replace(/\s/g, '')}
                                            </span>
                                         )}
                                     </div>
                                </div>
                             ) : (
                                <div className="h-full min-h-[44px] flex items-center justify-center text-gray-300">
                                    {isQuickScheduleMode && !isReadOnly ? (
                                         <div className="flex flex-col items-center scale-75 opacity-40">
                                             <span className="text-xs font-bold">{quickScheduleStation}</span>
                                             <span className="text-[10px] font-bold text-indigo-600">{quickScheduleTask}</span>
                                         </div>
                                    ) : null}
                                </div>
                             )}
                          </td>
                        );
                    })}
                  </tr>
                ))}
                {activeStaff.length === 0 && (
                      <tr>
                          <td colSpan={dateRange.length + 1} className="p-8 text-center text-gray-400">目前沒有健管人員，請先至「健管人員管理」新增名單。</td>
                      </tr>
                  )}
              </tbody>
            </table>
          </div>
          
      {/* Inline Shift Edit Popup */}
      {selectedCell && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-gray-100 animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-teal-50/50">
              <div>
                  <h3 className="font-bold text-gray-800 text-lg">
                      分配任務 - {healthMgmtStaff.find(s => s.id === selectedCell.userId)?.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                      {selectedCell.date} • {['日', '一', '二', '三', '四', '五', '六'][new Date(selectedCell.date).getDay()]}
                  </p>
              </div>
              <button onClick={() => setSelectedCell(null)} className="text-gray-400 hover:text-gray-600 bg-white p-1 rounded-full shadow-sm hover:shadow transition-all">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase flex justify-between">
                      <span>崗位分配 (H, G, 櫃台...)</span>
                      {editingShiftTask && <span className="text-teal-600 cursor-pointer hover:underline" onClick={() => setEditingShiftTask('')}>清除</span>}
                  </label>
                  <div className="flex flex-wrap gap-1.5 p-1 max-h-[100px] overflow-y-auto">
                      {hmStations.map(st => (
                          <button
                              key={st}
                              onClick={() => setEditingShiftTask(st)}
                              className={"px-3 py-1.5 rounded-lg text-xs font-bold border transition-all " + (editingShiftTask === st ? 'bg-teal-500 text-white border-teal-600 shadow-sm' : 'bg-slate-50 text-gray-600 border-gray-200 hover:border-teal-300 hover:bg-white')}
                          >
                              {st}
                          </button>
                      ))}
                  </div>
              </div>

              <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase flex justify-between">
                      <span>業務任務 (主控, 輔控...)</span>
                      {editingShiftSubTask && <span className="text-indigo-600 cursor-pointer hover:underline" onClick={() => setEditingShiftSubTask('')}>清除</span>}
                  </label>
                  <div className="flex flex-wrap gap-1.5 p-1 max-h-[100px] overflow-y-auto">
                      {hmTasks.map(tk => (
                          <button
                              key={tk}
                              onClick={() => setEditingShiftSubTask(tk)}
                              className={"px-3 py-1.5 rounded-lg text-xs font-bold border transition-all " + (editingShiftSubTask === tk ? 'bg-indigo-500 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-white')}
                          >
                              {tk}
                          </button>
                      ))}
                  </div>
              </div>

              <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase">工作時段 (選填)</label>
                  <input
                      type="text"
                      value={editingShiftTime}
                      onChange={e => setEditingShiftTime(e.target.value)}
                      placeholder="例: 08:00-16:00"
                      className="w-full px-4 py-2 bg-slate-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                  />
              </div>

              <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase">自訂業務任務</label>
                  <input
                      type="text"
                      value={editingShiftCustomTask}
                      onChange={e => setEditingShiftCustomTask(e.target.value)}
                      placeholder="自訂任務名稱"
                      className="w-full px-4 py-2 bg-slate-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                  />
              </div>

              <div className="pt-2">
                  <button 
                      onClick={handleSavePopup}
                      className="w-full bg-teal-600 text-white font-bold py-3 rounded-xl hover:bg-teal-700 transition-colors shadow-sm"
                  >
                      確認儲存
                  </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      ) : activeTab === 'stats' ? (
        /* Statistics Tab */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-fit">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h3 className="font-bold text-gray-700">
                        建管排班統計 ({selectedCycleId === 'month' ? toLocalISOString(currentDate).substring(0, 7) : currentCycle?.name})
                    </h3>
                    {selectedCycleId === 'month' && (
                        <div className="flex items-center gap-1 bg-white border rounded-lg px-2 py-1">
                            <Calendar size={14} className="text-gray-400" />
                            <input 
                                type="month" 
                                value={toLocalISOString(currentDate).substring(0, 7)}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        const [y, m] = e.target.value.split('-').map(Number);
                                        setCurrentDate(new Date(y, m - 1, 1));
                                    }
                                }}
                                className="text-sm font-bold border-none outline-none bg-transparent"
                            />
                        </div>
                    )}
                </div>
                <button
                    onClick={handleExportStats}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
                >
                    <FileSpreadsheet size={16} /> 匯出 Excel
                </button>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                            <th className="p-4 text-left font-bold sticky left-0 bg-slate-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">姓名</th>
                            {hmStations.map(st => (
                                <th key={st} className="p-4 text-center font-bold">{st}</th>
                            ))}
                            <th className="p-4 text-center font-bold text-teal-600">總計天數</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {stats.map(({ staff, counts, total }) => (
                            <tr key={staff.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-4 font-bold text-slate-700 sticky left-0 bg-white z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{staff.name}</td>
                                {hmStations.map(st => (
                                    <td key={st} className="p-4 text-center text-slate-600">
                                        {counts[st] > 0 ? (
                                            <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">{counts[st]}</span>
                                        ) : '-'}
                                    </td>
                                ))}
                                <td className="p-4 text-center">
                                    <span className="font-extrabold text-teal-700 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-100">{total}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      ) : (
        /* Staff Management Tab */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-700">健管人員名單</h3>
          </div>
          <div className="p-6 max-w-lg">
              <form onSubmit={editingId ? updateStaff : addStaff} className="flex gap-2 items-center mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="flex-[2] flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-teal-600 uppercase pl-1">姓名</label>
                      <input
                          type="text"
                          value={editingId ? editingStaffName : newStaffName}
                          onChange={e => editingId ? setEditingStaffName(e.target.value) : setNewStaffName(e.target.value)}
                          placeholder="姓名 (例: 健管1)"
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-teal-600 uppercase pl-1">簡稱</label>
                      <input
                          type="text"
                          value={editingId ? editingStaffAlias : newStaffAlias}
                          onChange={e => editingId ? setEditingStaffAlias(e.target.value) : setNewStaffAlias(e.target.value)}
                          placeholder="簡稱 (例: 健1)"
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                  </div>
                  <button
                      type="submit"
                      disabled={isSaving || isReadOnly}
                      className="whitespace-nowrap bg-teal-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-teal-700 transition-colors disabled:opacity-50"
                  >
                      {editingId ? '儲存更新' : '新增人員'}
                  </button>
                  {editingId && (
                      <button 
                          type="button" 
                          onClick={() => { setEditingId(null); setEditingStaffName(''); }}
                          className="px-4 py-2 text-gray-500 hover:bg-gray-200 rounded-lg font-bold transition-colors"
                      >
                          取消
                      </button>
                  )}
              </form>

              {error && <div className="text-red-500 text-sm font-bold mb-4 p-3 bg-red-50 rounded-lg border border-red-100">{error}</div>}

              <div className="space-y-2">
                  {activeStaff.map(staff => (
                      <div key={staff.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-700">{staff.name}</span>
                              {staff.alias && <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">({staff.alias})</span>}
                          </div>
                          <div className="flex items-center gap-2">
                              {!isReadOnly && (
                                  <>
                                      <button 
                                          onClick={() => handleEditStaff(staff)}
                                          className="px-3 py-1 text-xs font-bold text-teal-600 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
                                      >
                                          編輯
                                      </button>
                                      <button 
                                          onClick={() => setDeleteTargetId(staff.id)}
                                          className="px-3 py-1 text-xs font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                                      >
                                          停用
                                      </button>
                                  </>
                              )}
                          </div>
                      </div>
                  ))}
                  {activeStaff.length === 0 && (
                      <div className="text-center text-gray-400 py-8 font-bold">
                          目前沒有健管人員，請在上方新增
                      </div>
                  )}
              </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthMgmtPage;
