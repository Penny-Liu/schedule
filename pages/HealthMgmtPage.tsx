import React, { useState, useEffect, useMemo } from 'react';
import { User, Shift, UserRole, PERMISSIONS } from '../types';
import { db } from '../services/store';
import { LayoutDashboard, Users, Calendar, Save, Trash2, Plus, ArrowLeft, ArrowRight, Loader2, Check } from 'lucide-react';
import { toLocalISOString, generateUUID } from '../services/utils';

interface HealthMgmtPageProps {
  currentUser: User;
}

const STATIONS = ['健管主控', '健管輔控'];

const HealthMgmtPage: React.FC<HealthMgmtPageProps> = ({ currentUser }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [healthMgmtUsers, setHealthMgmtUsers] = useState<User[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const users = db.getUsers().filter(u => u.isHealthMgmt && u.isActive !== false);
      setHealthMgmtUsers(users);
      setShifts(db.getShifts('', ''));
    };
    loadData();
    const unsubscribe = db.subscribe(() => {
        setShifts([...db.getShifts('', '')]);
    });
    return () => unsubscribe();
  }, []);

  const dateRange = useMemo(() => {
    const dates = [];
    const start = new Date(currentDate);
    // Show 7 days starting from current
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(toLocalISOString(d));
    }
    return dates;
  }, [currentDate]);

  const handlePrevWeek = () => {
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 7);
    setCurrentDate(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 7);
    setCurrentDate(next);
  };

  const handleUpdateShift = async (userId: string, date: string, station: string) => {
    // Note: Health Mgmt shifts are treated like normal shifts but with specific station names
    // If user already has a shift on this date, we might need to decide if we overwrite or add special role
    // For this requirement, we assume these are dedicated stations.
    
    // First, clear any other user assigned to this station on this date
    const existingAtStation = shifts.find(s => s.date === date && s.station === station);
    if (existingAtStation) {
        await db.upsertShift({ ...existingAtStation, station: '未分配' });
    }

    if (userId) {
        // Find if this user already has BROADER shift data (e.g. special roles)
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
    
    setShifts([...db.getShifts('', '')]);
  };

  const getShiftUser = (date: string, station: string) => {
    const shift = shifts.find(s => s.date === date && s.station === station);
    if (!shift) return '';
    return shift.userId;
  };

  const canEdit = currentUser.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT) || currentUser.role === UserRole.SYSTEM_ADMIN;

  return (
    <div className="p-6 max-w-7xl mx-auto h-screen overflow-y-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <LayoutDashboard className="text-teal-600" size={24} />
            健管排班總覽
          </h2>
          <p className="text-sm text-gray-500">指派每日健管主控與輔控人員</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border">
          <button onClick={handlePrevWeek} className="p-2 hover:bg-gray-50 rounded-lg text-gray-500 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="px-4 py-1 text-sm font-bold text-gray-700 min-w-[150px] text-center">
            {dateRange[0]} ~ {dateRange[6]}
          </div>
          <button onClick={handleNextWeek} className="p-2 hover:bg-gray-50 rounded-lg text-gray-500 transition-colors">
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-40 sticky left-0 bg-gray-50 z-10">
                  崗位
                </th>
                {dateRange.map(date => {
                  const d = new Date(date);
                  const isToday = toLocalISOString(new Date()) === date;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <th key={date} className={`p-4 text-center border-l border-gray-100 min-w-[140px] ${isToday ? 'bg-teal-50' : ''}`}>
                      <div className={`text-[11px] ${isToday ? 'text-teal-600 font-bold' : 'text-gray-400'}`}>
                        {date.split('-').slice(1).join('/')}
                      </div>
                      <div className={`text-[13px] font-bold ${isToday ? 'text-teal-700' : (isWeekend ? 'text-red-500' : 'text-gray-700')}`}>
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
                  <td className="p-4 font-bold text-gray-700 text-sm bg-white sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                    {station}
                  </td>
                  {dateRange.map(date => {
                    const selectedUserId = getShiftUser(date, station);
                    return (
                      <td key={date} className="p-3 border-l border-gray-50">
                        {canEdit ? (
                          <select
                            value={selectedUserId}
                            onChange={(e) => handleUpdateShift(e.target.value, date, station)}
                            className={`w-full p-2 text-xs rounded-lg border focus:ring-2 focus:ring-teal-500 outline-none transition-all cursor-pointer ${
                              selectedUserId ? 'bg-teal-50 border-teal-200 text-teal-800 font-medium' : 'bg-gray-50 border-gray-100 text-gray-400'
                            }`}
                          >
                            <option value="">未分配</option>
                            {healthMgmtUsers.map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className={`text-center py-2 px-3 rounded-lg text-sm font-medium ${
                            selectedUserId ? 'bg-teal-50 text-teal-700' : 'text-gray-400 italic'
                          }`}>
                            {selectedUserId ? healthMgmtUsers.find(u => u.id === selectedUserId)?.name : '未分配'}
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
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
           <h4 className="text-blue-800 font-bold text-sm mb-1 flex items-center gap-2">
             <Calendar size={16} /> 注意事項
           </h4>
           <p className="text-xs text-blue-600 leading-relaxed">
             此處排班會直接同步至排班總覽。若人員在同一天已有放射師崗位，變更此處將會移動該人員的崗位。
           </p>
        </div>
        <div className="bg-teal-50 p-4 rounded-xl border border-teal-100">
           <h4 className="text-teal-800 font-bold text-sm mb-1 flex items-center gap-2">
             <Users size={16} /> 健管人員名單
           </h4>
           <p className="text-xs text-teal-600 leading-relaxed">
             僅限在「人員管理」中勾選為「健管人員」的同仁會出現在下拉選單中。
           </p>
        </div>
      </div>
    </div>
  );
};

export default HealthMgmtPage;
