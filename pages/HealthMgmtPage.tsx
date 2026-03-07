import React, { useState, useEffect, useMemo } from 'react';
import { User, Shift, UserRole, PERMISSIONS, StaffGroup } from '../types';
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    role: UserRole.EMPLOYEE,
    isActive: true,
  });

  useEffect(() => {
    const loadData = () => {
      const users = db.getUsers().filter(u => u.isHealthMgmt);
      setHealthMgmtUsers(users);
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
    const existingAtStation = shifts.find(s => s.date === date && s.station === station);
    if (existingAtStation) {
        await db.upsertShift({ ...existingAtStation, station: '未分配' });
    }
    if (userId) {
        const userExistingShift = shifts.find(s => s.userId === userId && s.date === date);
        if (userExistingShift) {
            await db.upsertShift({ ...userExistingShift, station });
        } else {
            await db.upsertShift({
                id: generateUUID(),
                userId,
                date,
                station,
                specialRoles: []
            });
        }
    }
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      if (editingId) {
        await db.updateUser(editingId, {
          name: formData.name,
          username: formData.username,
          isActive: formData.isActive
        });
      } else {
        const newUser: User = {
          id: generateUUID(),
          name: formData.name,
          alias: formData.name.charAt(0),
          username: formData.username,
          role: UserRole.EMPLOYEE,
          groupId: StaffGroup.GROUP_A,
          color: '#3B82F6',
          isRadiographer: false,
          isHealthMgmt: true,
          isActive: true,
          password: '1234',
          mustChangePassword: true,
          permissions: []
        };
        await db.addUser(newUser);
      }
      setEditingId(null);
      setFormData({ name: '', username: '', role: UserRole.EMPLOYEE, isActive: true });
    } catch (err: any) {
      setError(err.message || '儲存失敗');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditStaff = (user: User) => {
    setEditingId(user.id);
    setFormData({
      name: user.name,
      username: user.username,
      role: user.role,
      isActive: user.isActive !== false
    });
    setActiveTab('staff');
  };

  const handleDeleteStaff = async () => {
    if (deleteTargetId) {
      await db.deleteUser(deleteTargetId);
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
                    <th className="p-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-40 sticky left-0 bg-gray-50 z-10">崗位</th>
                    {dateRange.map(date => {
                      const d = new Date(date);
                      const isToday = toLocalISOString(new Date()) === date;
                      return (
                        <th key={date} className={`p-4 text-center border-l border-gray-100 min-w-[140px] ${isToday ? 'bg-teal-50' : ''}`}>
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
                  {STATIONS.map(station => (
                    <tr key={station} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="p-4 font-bold text-gray-700 text-sm bg-white sticky left-0 z-10">{station}</td>
                      {dateRange.map(date => {
                        const shift = shifts.find(s => s.date === date && s.station === station);
                        const selectedUserId = shift ? shift.userId : '';
                        return (
                          <td key={date} className="p-3 border-l border-gray-50 text-center">
                            {canEdit ? (
                              <select
                                value={selectedUserId}
                                onChange={(e) => handleUpdateShift(e.target.value, date, station)}
                                className={`w-full p-2 text-xs rounded-lg border focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer ${
                                  selectedUserId ? 'bg-teal-50 border-teal-200 text-teal-800 font-medium' : 'bg-gray-50 border-gray-100 text-gray-400'
                                }`}
                              >
                                <option value="">未分配</option>
                                {healthMgmtUsers.filter(u => u.isActive !== false).map(u => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm">{healthMgmtUsers.find(u => u.id === selectedUserId)?.name || '-'}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm sticky top-4">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <UserPlus size={18} className="text-teal-600" />
                {editingId ? '編輯健管人員' : '新增健管人員'}
              </h3>
              <form onSubmit={handleStaffSubmit} className="space-y-4">
                {error && <div className="p-2 text-xs bg-red-50 text-red-600 rounded border border-red-100">{error}</div>}
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">姓名</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    placeholder="例如：林健管"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">帳號 (Username)</label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none font-mono"
                    placeholder="hm_staff_01"
                  />
                </div>
                {editingId && (
                   <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-100">
                    <input
                      type="checkbox"
                      id="isActive_hm"
                      checked={formData.isActive}
                      onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4 text-teal-600"
                    />
                    <label htmlFor="isActive_hm" className="text-xs font-bold text-gray-700">在職中</label>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setFormData({ name: '', username: '', role: UserRole.EMPLOYEE, isActive: true }); }}
                      className="flex-1 px-4 py-2 border rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-50"
                    >
                      取消
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 bg-teal-600 text-white rounded-lg py-2 text-sm font-bold hover:bg-teal-700 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? '處理中...' : (editingId ? '儲存變更' : '建立人員')}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-3">
             {healthMgmtUsers.map(user => (
               <div key={user.id} className={`bg-white p-4 rounded-xl border flex items-center justify-between transition-all ${user.isActive === false ? 'opacity-50' : 'hover:shadow-sm'}`}>
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-gray-800">{user.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{user.username}</div>
                    </div>
                 </div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => handleEditStaff(user)} className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                      <Save size={18} />
                    </button>
                    <button onClick={() => setDeleteTargetId(user.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={18} />
                    </button>
                 </div>
               </div>
             ))}
             {healthMgmtUsers.length === 0 && (
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
