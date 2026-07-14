import React, { useState, useMemo, useEffect, useRef } from "react";
import { User, GeneAppointment, GeneSettings } from "../types";
import { db } from "../services/store";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Clock,
  User as UserIcon,
  FileText,
  Trash2,
  Settings,
  AlertTriangle,
  CalendarDays
} from "lucide-react";
import { toLocalISOString, generateUUID } from "../services/utils";

interface GenePageProps {
  currentUser: User;
}

const DEFAULT_SETTINGS: GeneSettings = {
  openDays: [1, 2, 3, 4, 5],
  startTime: "08:00",
  endTime: "17:00",
  intervalMinutes: 30,
};

const generateTimeSlots = (settings: GeneSettings) => {
  const slots = [];
  const start = settings.startTime.split(":").map(Number);
  const end = settings.endTime.split(":").map(Number);
  let currentMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];

  while (currentMinutes <= endMinutes) {
    const h = Math.floor(currentMinutes / 60);
    const m = currentMinutes % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    currentMinutes += settings.intervalMinutes;
  }
  return slots;
};

const GenePage: React.FC<GenePageProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<"schedule" | "settings">("schedule");
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    db.loadDataForMonth(currentDate.getFullYear(), currentDate.getMonth() + 1);
  }, [currentDate]);

  const [appointments, setAppointments] = useState<GeneAppointment[]>(() => db.getGeneAppointments());
  const [settings, setSettings] = useState<GeneSettings>(() => db.settings.geneSettings || DEFAULT_SETTINGS);
  const [holidays, setHolidays] = useState(() => db.getHolidays());

  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setAppointments([...db.getGeneAppointments()]);
      setSettings(db.settings.geneSettings || DEFAULT_SETTINGS);
      setHolidays([...db.getHolidays()]);
    });
    db.initializeAuthData(true); if (db.currentUser) db.initializeDataForUser(db.currentUser, true);
    return () => unsubscribe();
  }, []);

  const timeSlots = useMemo(() => generateTimeSlots(settings), [settings]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: toLocalISOString(new Date()),
    startTime: timeSlots[0] || "08:00",
    endTime: timeSlots[1] || "08:30",
    medicalRecordNumber: "",
    registeredBy: currentUser.name,
  });

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  const weekStartStr = toLocalISOString(weekDays[0]);
  const weekEndStr = toLocalISOString(weekDays[6]);
  const weekAppointments = appointments.filter((b) => b.date >= weekStartStr && b.date <= weekEndStr);

  const getConflicts = (date: string, start: string, end: string) => {
    return appointments.filter((b) => b.date === date && start < b.endTime && end > b.startTime);
  };

  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];

  const handleJump2Months = () => {
    const target = new Date();
    target.setMonth(target.getMonth() + 2);
    const targetDateStr = toLocalISOString(target);
    const targetDay = target.getDay();
    
    setFormData(prev => ({ ...prev, date: targetDateStr }));
    setCurrentDate(target);

    // Auto-select earliest available time slot
    let foundSlot = false;
    for (let i = 0; i < timeSlots.length - 1; i++) {
      const st = timeSlots[i];
      const et = timeSlots[i + 1];
      const conflicts = getConflicts(targetDateStr, st, et);
      if (conflicts.length === 0) {
        setFormData(prev => ({ ...prev, startTime: st, endTime: et, date: targetDateStr }));
        foundSlot = true;
        break;
      }
    }

    const isHoliday = holidays.some(h => h.date === targetDateStr && h.title !== "補班");
    const isOpenDay = settings.openDays.includes(targetDay);

    if (isHoliday || !isOpenDay) {
      alert(`⚠️ 提醒您：\n您跳轉的日期 ${targetDateStr} (星期${dayNames[targetDay]}) \n${!isOpenDay ? '非基因解說開放日' : '為國定假日/休診日'}，可能無法排程，請再次確認！`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.medicalRecordNumber.trim() || !formData.registeredBy.trim()) {
      showToast("請填寫病歷號與登記人員", "error");
      return;
    }
    if (formData.startTime >= formData.endTime) {
      showToast("開始時間必須早於結束時間", "error");
      return;
    }

    const conflicts = getConflicts(formData.date, formData.startTime, formData.endTime);
    if (conflicts.length > 0) {
      if (!confirm("該時段已有預約，確定要重複預約嗎？")) return;
    }

    try {
      const newBooking: GeneAppointment = {
        id: generateUUID(),
        ...formData,
      };
      await db.addGeneAppointments([newBooking]);
      showToast("預約成功");
      setIsModalOpen(false);
    } catch (err: any) {
      showToast(err.message || "預約失敗", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除此預約嗎？")) return;
    try {
      await db.deleteGeneAppointment(id);
      showToast("已刪除預約");
    } catch (err: any) {
      showToast("刪除失敗", "error");
    }
  };

  const registeredByHistory = useMemo(() => {
    const names = appointments.map(a => a.registeredBy).filter(Boolean);
    return Array.from(new Set(names)).slice(0, 5); // top 5 unique names
  }, [appointments]);

  // Settings Handlers
  const handleSettingsSave = async () => {
    try {
      db.settings.geneSettings = settings;
      await db.updateSettings(db.settings);
      showToast("設定已儲存");
    } catch (err) {
      showToast("儲存失敗", "error");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-pink-100 rounded-lg text-pink-600">
              <UserIcon size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">基因解說系統</h1>
              <p className="text-sm text-gray-500">預約與管理基因解說排程</p>
            </div>
          </div>
          <div className="flex bg-slate-200 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("schedule")}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === "schedule" ? "bg-white text-pink-700 shadow-sm" : "text-slate-600"}`}
            >
              <CalendarIcon size={16} className="inline mr-1" /> 排程檢視
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === "settings" ? "bg-white text-pink-700 shadow-sm" : "text-slate-600"}`}
            >
              <Settings size={16} className="inline mr-1" /> 解說設定
            </button>
          </div>
        </div>

        {toast && (
          <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg font-bold z-50 animate-fade-in-down ${toast.type === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
            {toast.message}
          </div>
        )}

        {activeTab === "schedule" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100 gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    const d = new Date(currentDate);
                    d.setDate(d.getDate() - 7);
                    setCurrentDate(d);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="font-bold text-lg text-slate-700 flex items-center gap-2">
                  <CalendarIcon size={18} className="text-pink-500" />
                  {weekDays[0].toLocaleDateString()} - {weekDays[6].toLocaleDateString()}
                </div>
                <button
                  onClick={() => {
                    const d = new Date(currentDate);
                    d.setDate(d.getDate() + 7);
                    setCurrentDate(d);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
                <button
                  onClick={() => setCurrentDate(new Date())}
                  className="px-3 py-1 text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 rounded font-bold transition-colors"
                >
                  本週
                </button>
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto">
                 <input
                    type="date"
                    value={toLocalISOString(currentDate)}
                    onChange={(e) => {
                      if (e.target.value) setCurrentDate(new Date(e.target.value));
                    }}
                    className="flex-1 md:flex-none border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-pink-400"
                  />
                  <button
                    onClick={() => {
                      setIsModalOpen(true);
                      setFormData(prev => ({
                        ...prev,
                        date: toLocalISOString(currentDate)
                      }));
                    }}
                    className="flex items-center gap-2 bg-pink-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-pink-700 transition-colors shadow-sm whitespace-nowrap"
                  >
                    <Plus size={18} /> 新增預約
                  </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-8 border-b border-gray-200 bg-slate-50">
                  <div className="p-3 text-center text-xs font-bold text-gray-500 border-r border-gray-200">
                    時間
                  </div>
                  {weekDays.map((date, idx) => {
                    const isToday = date.toDateString() === new Date().toDateString();
                    const isOpen = settings.openDays.includes(date.getDay());
                    const holiday = holidays.find(h => h.date === toLocalISOString(date) && h.title !== "補班");
                    
                    return (
                      <div
                        key={idx}
                        className={`p-3 text-center border-r border-gray-200 last:border-0 ${isToday ? "bg-pink-50" : ""} ${!isOpen ? "opacity-60 bg-gray-50" : ""}`}
                      >
                        <div className={`text-sm font-bold ${isToday ? "text-pink-700" : "text-gray-700"}`}>
                          星期{dayNames[date.getDay()]}
                        </div>
                        <div className={`text-xs mt-1 ${isToday ? "text-pink-600" : "text-gray-500"}`}>
                          {date.getMonth() + 1}/{date.getDate()}
                        </div>
                        {holiday && (
                          <div className="text-[10px] bg-red-100 text-red-600 font-bold px-1 py-0.5 rounded mt-1">
                            {holiday.title}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="divide-y divide-gray-100">
                  {timeSlots.slice(0, -1).map((time, slotIdx) => (
                    <div key={slotIdx} className="grid grid-cols-8 group">
                      <div className="p-3 text-xs font-bold text-slate-500 text-center border-r border-gray-200 bg-slate-50/50 flex items-center justify-center">
                        {time} - {timeSlots[slotIdx + 1]}
                      </div>
                      {weekDays.map((date, dayIdx) => {
                        const dateStr = toLocalISOString(date);
                        const slotBookings = weekAppointments.filter(
                          (b) => b.date === dateStr && time >= b.startTime && time < b.endTime
                        );
                        const isOpen = settings.openDays.includes(date.getDay());
                        
                        return (
                          <div
                            key={dayIdx}
                            className={`p-1 border-r border-gray-100 last:border-0 min-h-[60px] relative transition-colors ${!isOpen ? "bg-gray-50/80" : "hover:bg-slate-50 cursor-pointer"}`}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('.booking-card')) return;
                              setFormData({
                                ...formData,
                                date: dateStr,
                                startTime: time,
                                endTime: timeSlots[slotIdx + 1]
                              });
                              setIsModalOpen(true);
                            }}
                          >
                            {slotBookings.map((booking) => (
                              <div
                                key={booking.id}
                                className="booking-card mb-1 p-1.5 bg-pink-100 border border-pink-200 rounded text-[10px] leading-tight group/card relative hover:shadow-md transition-all z-10"
                                onClick={() => {
                                  setFormData({
                                    date: booking.date,
                                    startTime: booking.startTime,
                                    endTime: booking.endTime,
                                    medicalRecordNumber: booking.medicalRecordNumber,
                                    registeredBy: booking.registeredBy
                                  });
                                  setIsModalOpen(true);
                                }}
                              >
                                <div className="font-bold text-pink-900 truncate">
                                  {booking.medicalRecordNumber}
                                </div>
                                <div className="text-pink-700 flex justify-between mt-1 items-center">
                                  <span>{booking.registeredBy}</span>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleDelete(booking.id); }}
                                    className="hidden group-hover/card:block text-red-500 hover:text-red-700 p-0.5 bg-white rounded-full shadow-sm"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 max-w-2xl">
            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Settings size={20} className="text-pink-500" /> 解說開放規則設定
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">開放星期</label>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                    <button
                      key={day}
                      onClick={() => {
                        setSettings(prev => {
                          const newDays = prev.openDays.includes(day)
                            ? prev.openDays.filter(d => d !== day)
                            : [...prev.openDays, day];
                          return { ...prev, openDays: newDays };
                        });
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${settings.openDays.includes(day) ? "bg-pink-100 border-pink-300 text-pink-700" : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"}`}
                    >
                      星期{dayNames[day]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">每日開始時間</label>
                  <input
                    type="time"
                    value={settings.startTime}
                    onChange={(e) => setSettings({ ...settings, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">每日結束時間</label>
                  <input
                    type="time"
                    value={settings.endTime}
                    onChange={(e) => setSettings({ ...settings, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">單次預約間隔 (分鐘)</label>
                <select
                  value={settings.intervalMinutes}
                  onChange={(e) => setSettings({ ...settings, intervalMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                >
                  <option value={15}>15 分鐘</option>
                  <option value={30}>30 分鐘</option>
                  <option value={60}>60 分鐘</option>
                </select>
              </div>
              
              <div className="pt-6 border-t border-gray-100 flex justify-end">
                <button
                  onClick={handleSettingsSave}
                  className="bg-slate-800 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-slate-900 transition-colors shadow-sm"
                >
                  儲存設定
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-scale-in">
            <div className="bg-gradient-to-r from-pink-600 to-rose-500 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <FileText size={20} />
                基因解說預約
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-white/80 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">客戶病歷號 *</label>
                <input
                  type="text"
                  required
                  placeholder="輸入病歷號"
                  value={formData.medicalRecordNumber}
                  onChange={(e) => setFormData({ ...formData, medicalRecordNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                />
              </div>

              <div>
                 <div className="flex justify-between items-end mb-1">
                   <label className="block text-sm font-bold text-gray-700">預約日期 *</label>
                   <button 
                     type="button" 
                     onClick={handleJump2Months}
                     className="text-xs font-bold text-pink-600 hover:text-pink-800 flex items-center gap-1 bg-pink-50 px-2 py-1 rounded"
                   >
                     <CalendarDays size={12} /> 快速跳至兩個月後
                   </button>
                 </div>
                 
                 <div className="relative">
                   <input
                     type="date"
                     required
                     value={formData.date}
                     onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 pr-24"
                   />
                   <span className="absolute right-3 top-2.5 text-xs font-bold text-gray-400">
                     星期{formData.date ? dayNames[new Date(formData.date).getDay()] : ""}
                   </span>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">開始時間 *</label>
                  <select
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                  >
                    {timeSlots.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">結束時間 *</label>
                  <select
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                  >
                    {timeSlots.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">登記人員 (健管師) *</label>
                <input
                  type="text"
                  required
                  placeholder="輸入登記人員姓名"
                  value={formData.registeredBy}
                  onChange={(e) => setFormData({ ...formData, registeredBy: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 mb-2"
                />
                {registeredByHistory.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {registeredByHistory.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setFormData({ ...formData, registeredBy: name })}
                        className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-pink-100 text-slate-600 hover:text-pink-700 rounded-full transition-colors border border-slate-200"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-pink-600 text-white rounded-lg font-bold hover:bg-pink-700 transition-colors shadow-sm"
                >
                  儲存預約
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenePage;
