import React, { useState, useEffect, useMemo } from 'react';
import { User, Shift, UserRole, PERMISSIONS, StaffGroup, HealthMgmtStaff } from '../types';
import { db } from '../services/store';
import { LayoutDashboard, Users, Calendar, Save, Trash2, Plus, ArrowLeft, ArrowRight, X, AlertCircle, Key, UserPlus } from 'lucide-react';
import { toLocalISOString, generateUUID } from '../services/utils';
import ConfirmModal from '../components/ConfirmModal';

interface HealthMgmtPageProps {
  currentUser: User;
}

const STATIONS = ['健管主控', '健管輔控'];

const HealthMgmtPage: React.FC<HealthMgmtPageProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'staff'>('schedule');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [healthMgmtUsers, setHealthMgmtUsers] = useState<User[]>([]);
  const [healthMgmtStaff, setHealthMgmtStaff] = useState<HealthMgmtStaff[]>([]); // Changed from healthMgmtUsers
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [newStaffName, setNewStaffName] = useState(''); // For adding new staff
  const [editingStaffName, setEditingStaffName] = useState(''); // For editing existing staff name
  const [editingStaffIsActive, setEditingStaffIsActive] = useState(true); // For editing existing staff active status

  // HM Shift Editing Modal State
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [editingShiftStaffId, setEditingShiftStaffId] = useState<string | null>(null);
  const [editingShiftDate, setEditingShiftDate] = useState<string | null>(null);
  const [editingShiftTime, setEditingShiftTime] = useState('');
  const [editingShiftTask, setEditingShiftTask] = useState('');

  const isReadOnly = (currentUser.role === UserRole.VIEWER || currentUser.role === UserRole.EMPLOYEE) && !currentUser.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT);

  // Fetch HM staff exclusively from the new table
  const dbHMStaff = useMemo(() => {
      return db.getHealthMgmtStaff().filter(s => s.isActive !== false);
  }, [db.healthMgmtStaff]); // Depend on db.healthMgmtStaff

  // State for local modifications (if needed, but for this change, direct DB updates are used)
  // const [localStaff, setLocalStaff] = useState<HealthMgmtStaff[]>([]);

  useEffect(() => {
    const loadData = () => {
      setHealthMgmtStaff(db.getHealthMgmtStaff()); // Fetch from new HealthMgmtStaff table
      setShifts(db.getShifts('', ''));
    };
    loadData();
    const unsubscribe = db.subscribe(loadData);
    return () => unsubscribe();
  }, []);

  const dateRange = useMemo(() => {
    const dates = [];
    const start = new Date(currentDate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(toLocalISOString(d));
    }
    return dates;
  }, [currentDate]);

  const handleUpdateShift = async (userId: string, date: string, station: string) => {
    if (isReadOnly) return;
    const existing = shifts.find(s => s.userId === userId && s.date === date);
    
    if (existing) {
        if (!station) {
            await db.deleteShift(userId, date);
        } else {
            await db.upsertShift({ ...existing, station });
        }
    } else if (station) {
        const newShift: Shift = {
            id: generateUUID(),
            userId,
            date,
            station,
            specialRoles: []
        };
        await db.upsertShift(newShift);
    }
  };

  const openShiftModal = (userId: string, date: string) => {
      if (isReadOnly) return;
      setEditingShiftStaffId(userId);
      setEditingShiftDate(date);
      
      const existing = shifts.find(s => s.userId === userId && s.date === date);
      if (existing && existing.station && existing.station !== '未分配') {
          const parts = existing.station.split(' ');
          if (parts.length > 1) {
              setEditingShiftTime(parts[0]);
              setEditingShiftTask(parts.slice(1).join(' '));
          } else {
              setEditingShiftTime('');
              setEditingShiftTask(existing.station);
          }
      } else {
          setEditingShiftTime('');
          setEditingShiftTask('');
      }
      setIsShiftModalOpen(true);
  };

  const handleSaveShiftModal = async () => {
      if (!editingShiftStaffId || !editingShiftDate) return;
      
      let finalStation = '';
      if (editingShiftTime || editingShiftTask) {
          finalStation = `${editingShiftTime} ${editingShiftTask}`.trim();
      }

      await handleUpdateShift(editingShiftStaffId, editingShiftDate, finalStation);
      setIsShiftModalOpen(false);
  };

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
              isActive: true
          };
          await db.addHealthMgmtStaff(newStaff);
          setNewStaffName('');
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
          await db.updateHealthMgmtStaff(editingId, { name: editingStaffName.trim(), isActive: editingStaffIsActive });
          setEditingId(null);
          setEditingStaffName('');
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
    <div className="p-6 max-w-7xl mx-auto h-screen overflow-y-auto">
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
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === 'schedule' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Calendar size={16} /> 排班總覽
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === 'staff' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users size={16} /> 健管人員管理
          </button>
        </div>
      </div>

      {activeTab === 'schedule' ? (
        <>
          <div className="mb-4 flex justify-between items-center">
            <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border">
              <button onClick={() => {
                const prev = new Date(currentDate);
                prev.setDate(prev.getDate() - 7);
                setCurrentDate(prev);
              }} className="p-2 hover:bg-gray-50 rounded-lg text-gray-500 transition-colors">
                <ArrowLeft size={18} />
              </button>
              <div className="px-4 py-1 text-sm font-bold text-gray-700 min-w-[150px] text-center">
                {dateRange[0]} ~ {dateRange[6]}
              </div>
              <button onClick={() => {
                const next = new Date(currentDate);
                next.setDate(next.getDate() + 7);
                setCurrentDate(next);
              }} className="p-2 hover:bg-gray-50 rounded-lg text-gray-500 transition-colors">
                <ArrowRight size={18} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="p-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32 sticky left-0 bg-gray-50 z-10">人員</th>
                    {dateRange.map(date => {
                      const d = new Date(date);
                      const isToday = toLocalISOString(new Date()) === date;
                      return (
                        <th key={date} className={`p-4 text-center border-l border-gray-100 min-w-[100px] ${isToday ? 'bg-teal-50' : ''}`}>
                          <div className="text-[11px] text-gray-400">{date.split('-').slice(1).join('/')}</div>
                          <div className={`text-[13px] font-bold ${isToday ? 'text-teal-700' : 'text-gray-700'}`}>
                            {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {dbHMStaff.map(staff => (
                    <tr key={staff.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="p-4 font-bold text-gray-700 text-sm bg-white sticky left-0 z-10 whitespace-nowrap">{staff.name}</td>
                      {dateRange.map(date => {
                        const shift = shifts.find(s => s.userId === staff.id && s.date === date);
                        const displayVal = shift && shift.station !== '未分配' ? shift.station : '';
                        
                        // Parse display values
                        const parts = displayVal.split(' ');
                        const time = parts.length > 1 ? parts[0] : '';
                        const task = parts.length > 1 ? parts.slice(1).join(' ') : displayVal;

                        return (
                          <td 
                            key={date} 
                            onClick={() => openShiftModal(staff.id, date)}
                            className={`p-2 border-l border-gray-50 text-center cursor-pointer transition-colors ${displayVal ? 'bg-teal-50/30 hover:bg-teal-100/50' : 'hover:bg-gray-100/50'}`}
                          >
                             {displayVal ? (
                                <div className="flex flex-col items-center justify-center h-full min-h-[44px]">
                                    {time && <span className="text-xs text-gray-500 font-mono">{time}</span>}
                                    {task && <span className="text-sm font-bold text-teal-800">{task}</span>}
                                </div>
                             ) : (
                                <div className="h-full min-h-[44px] flex items-center justify-center text-gray-300">
                                    <Plus size={16} className="opacity-0 group-hover:opacity-100" />
                                </div>
                             )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {dbHMStaff.length === 0 && (
                      <tr>
                          <td colSpan={dateRange.length + 1} className="p-8 text-center text-gray-400">目前沒有健管人員，請先至「健管人員管理」新增名單。</td>
                      </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Shift Editing Modal */}
          {isShiftModalOpen && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                      <div className="p-4 border-b flex items-center justify-between bg-gray-50">
                          <h3 className="font-bold text-gray-800">
                              編輯班表 - {dbHMStaff.find(s => s.id === editingShiftStaffId)?.name}
                          </h3>
                          <button onClick={() => setIsShiftModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                              <X size={20} />
                          </button>
                      </div>
                      <div className="p-5 space-y-4">
                          <div>
                              <label className="text-xs font-bold text-gray-500 mb-1 block">日期</label>
                              <div className="text-sm font-medium text-gray-700 bg-gray-50 p-2 rounded-lg border">{editingShiftDate}</div>
                          </div>
                          <div>
                              <label className="text-xs font-bold text-gray-500 mb-1 block">時間 (選填)</label>
                              <input 
                                  type="text" 
                                  value={editingShiftTime}
                                  onChange={e => setEditingShiftTime(e.target.value)}
                                  placeholder="例如：08:00-16:00"
                                  className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none font-mono"
                              />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-gray-500 mb-2 block">任務 (選填)</label>
                              <div className="flex flex-wrap gap-2">
                                  {['主管', '輔控', '排班', '晚班', 'call班'].map(t => (
                                      <button
                                          key={t}
                                          type="button"
                                          onClick={() => setEditingShiftTask(editingShiftTask === t ? '' : t)}
                                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors border ${
                                              editingShiftTask === t 
                                                ? 'bg-teal-100 text-teal-800 border-teal-200' 
                                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                          }`}
                                      >
                                          {t}
                                      </button>
                                  ))}
                              </div>
                              <input 
                                  type="text" 
                                  value={editingShiftTask}
                                  onChange={e => setEditingShiftTask(e.target.value)}
                                  placeholder="自訂任務"
                                  className="w-full mt-2 p-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                              />
                          </div>
                      </div>
                      <div className="p-4 border-t bg-gray-50 flex justify-between gap-3">
                          {editingShiftTime || editingShiftTask ? (
                              <button 
                                  onClick={() => handleUpdateShift(editingShiftStaffId!, editingShiftDate!, '')}
                                  className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-bold hover:bg-red-50"
                              >
                                  清除排班
                              </button>
                          ) : (
                              <div /> // Spacer
                          )}
                          <div className="flex gap-2">
                            <button 
                                onClick={() => setIsShiftModalOpen(false)}
                                className="px-4 py-2 border rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100 bg-white"
                            >
                                取消
                            </button>
                            <button 
                                onClick={handleSaveShiftModal}
                                className="px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700"
                            >
                                儲存
                            </button>
                          </div>
                      </div>
                  </div>
              </div>
          )}
        </>
      ) : (

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm sticky top-4">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <UserPlus size={18} className="text-teal-600" />
                {editingId ? '編輯健管人員' : '新增健管人員'}
              </h3>
              <form onSubmit={editingId ? updateStaff : addStaff} className="space-y-4">
                {error && <div className="p-2 text-xs bg-red-50 text-red-600 rounded border border-red-100">{error}</div>}
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">姓名</label>
                  <input
                    type="text"
                    required
                    value={editingId ? editingStaffName : newStaffName}
                    onChange={e => editingId ? setEditingStaffName(e.target.value) : setNewStaffName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    placeholder="例如：林健管"
                    disabled={isReadOnly}
                  />
                </div>
                {editingId && (
                   <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-100">
                    <input
                      type="checkbox"
                      id="isActive_hm"
                      checked={editingStaffIsActive}
                      onChange={e => setEditingStaffIsActive(e.target.checked)}
                      className="w-4 h-4 text-teal-600"
                      disabled={isReadOnly}
                    />
                    <label htmlFor="isActive_hm" className="text-xs font-bold text-gray-700">在職中</label>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setEditingStaffName(''); setEditingStaffIsActive(true); setError(null); }}
                      className="flex-1 px-4 py-2 border rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-50"
                      disabled={isReadOnly}
                    >
                      取消
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSaving || isReadOnly}
                    className="flex-1 bg-teal-600 text-white rounded-lg py-2 text-sm font-bold hover:bg-teal-700 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? '處理中...' : (editingId ? '儲存變更' : '建立人員')}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-3">
             {healthMgmtStaff.map(staff => (
               <div key={staff.id} className={`bg-white p-4 rounded-xl border flex items-center justify-between transition-all ${staff.isActive === false ? 'opacity-50' : 'hover:shadow-sm'}`}>
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold">
                      {staff.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-gray-800">{staff.name}</div>
                      <div className="text-xs text-teal-600 mt-0.5">健管人員</div>
                    </div>
                 </div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => handleEditStaff(staff)} disabled={isReadOnly} className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors disabled:opacity-50">
                      <Save size={18} />
                    </button>
                    <button onClick={() => setDeleteTargetId(staff.id)} disabled={isReadOnly} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                      <Trash2 size={18} />
                    </button>
                 </div>
               </div>
             ))}
             {healthMgmtStaff.length === 0 && (
               <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed text-gray-400 text-sm">
                 目前尚無健管人員，請由左側新增。
               </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthMgmtPage;
