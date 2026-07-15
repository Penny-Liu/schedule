import React, { useState, useMemo, useEffect } from "react";
import { User, GeneAppointment, GeneSettings, GeneRule, DailyGeneSchedule, PERMISSIONS } from "../types";
import { db } from "../services/store";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  User as UserIcon,
  FileText,
  Trash2,
  Settings,
  CalendarDays,
  Edit2
} from "lucide-react";
import { toLocalISOString, generateUUID } from "../services/utils";

interface GenePageProps {
  currentUser: User;
}

const createDefaultDailySchedule = (isOpen: boolean): DailyGeneSchedule => ({
  isOpen,
  morningStartTime: "08:30",
  morningEndTime: "10:30",
  afternoonStartTime: "13:00",
  afternoonEndTime: "15:00",
});

const createDefaultRule = (): GeneRule => {
  const today = new Date();
  const next3Months = new Date(today);
  next3Months.setMonth(next3Months.getMonth() + 3);

  return {
    id: generateUUID(),
    name: "預設規則",
    startDate: toLocalISOString(today),
    endDate: toLocalISOString(next3Months),
    schedules: [
      createDefaultDailySchedule(false), // Sun
      createDefaultDailySchedule(true),  // Mon
      createDefaultDailySchedule(true),  // Tue
      createDefaultDailySchedule(true),  // Wed
      createDefaultDailySchedule(true),  // Thu
      createDefaultDailySchedule(true),  // Fri
      createDefaultDailySchedule(false), // Sat
    ]
  };
};

const DEFAULT_SETTINGS: GeneSettings = {
  rules: [createDefaultRule()],
};

const getApplicableRule = (dateStr: string, settings: GeneSettings): GeneRule | null => {
  if (!settings.rules || !Array.isArray(settings.rules)) return null;
  // find first rule where date is within range
  return settings.rules.find(r => dateStr >= r.startDate && dateStr <= r.endDate) || null;
};

// Returns a list of time slots ("08:30", "09:00"...) based on min start and max end of the week
const generateWeeklyAxis = (weekDays: Date[], settings: GeneSettings) => {
  let minMinutes = 24 * 60;
  let maxMinutes = 0;
  let foundAnyOpen = false;
  let minInterval = 30; // fallback

  weekDays.forEach(date => {
    const dateStr = toLocalISOString(date);
    const rule = getApplicableRule(dateStr, settings);
    if (!rule) return;
    const schedule = rule.schedules[date.getDay()];
    if (schedule && schedule.isOpen) {
      foundAnyOpen = true;
      const mStart = schedule.morningStartTime.split(":").map(Number);
      const mEnd = schedule.morningEndTime.split(":").map(Number);
      const aStart = schedule.afternoonStartTime.split(":").map(Number);
      const aEnd = schedule.afternoonEndTime.split(":").map(Number);
      
      const mStartMins = mStart[0] * 60 + mStart[1];
      const mEndMins = mEnd[0] * 60 + mEnd[1];
      const aStartMins = aStart[0] * 60 + aStart[1];
      const aEndMins = aEnd[0] * 60 + aEnd[1];

      if (mStartMins < minMinutes) minMinutes = mStartMins;
      if (aEndMins > maxMinutes) maxMinutes = aEndMins;
    }
  });

  if (!foundAnyOpen) {
    minMinutes = 8 * 60 + 30; // 08:30
    maxMinutes = 15 * 60; // 15:00
  }

  const slots = [];
  let current = minMinutes;
  while (current <= maxMinutes) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    current += minInterval;
  }
  return { slots, minInterval };
};

const GenePage: React.FC<GenePageProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<"schedule" | "settings">("schedule");
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    db.loadDataForMonth(currentDate.getFullYear(), currentDate.getMonth() + 1);
  }, [currentDate]);

  const [appointments, setAppointments] = useState<GeneAppointment[]>(() => db.getGeneAppointments());
  
  // Migration logic for old openDays settings to new rules array
  const initialSettings = db.settings.geneSettings as any;
  let defaultSettingsToUse = DEFAULT_SETTINGS;
  if (initialSettings && initialSettings.openDays && !initialSettings.rules) {
     const rule = createDefaultRule();
     for (let i = 0; i < 7; i++) {
        rule.schedules[i].isOpen = initialSettings.openDays.includes(i);
     }
     defaultSettingsToUse = { rules: [rule] };
  } else if (initialSettings && initialSettings.rules) {
     initialSettings.rules.forEach((rule: any) => {
       rule.schedules?.forEach((sch: any) => {
         if (sch.morningStartTime === undefined) sch.morningStartTime = "08:30";
         if (sch.morningEndTime === undefined) sch.morningEndTime = "10:30";
         if (sch.afternoonStartTime === undefined) sch.afternoonStartTime = "13:00";
         if (sch.afternoonEndTime === undefined) sch.afternoonEndTime = "15:00";
       });
     });
     defaultSettingsToUse = initialSettings as GeneSettings;
  }

  const [settings, setSettings] = useState<GeneSettings>(defaultSettingsToUse);
  const [holidays, setHolidays] = useState(() => db.getHolidays());

  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setAppointments([...db.getGeneAppointments()]);
      const st = db.settings.geneSettings as any;
      if (st && st.rules) {
        st.rules.forEach((rule: any) => {
          rule.schedules?.forEach((sch: any) => {
            if (sch.morningStartTime === undefined) sch.morningStartTime = "08:30";
            if (sch.morningEndTime === undefined) sch.morningEndTime = "10:30";
            if (sch.afternoonStartTime === undefined) sch.afternoonStartTime = "13:00";
            if (sch.afternoonEndTime === undefined) sch.afternoonEndTime = "15:00";
          });
        });
        setSettings(st as GeneSettings);
      }
      setHolidays([...db.getHolidays()]);
    });
    db.initializeAuthData(true); if (db.currentUser) db.initializeDataForUser(db.currentUser, true);
    return () => unsubscribe();
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: toLocalISOString(new Date()),
    startTime: "08:30",
    companionCount: 1,
    medicalRecordNumbers: [""],
    isOnline: false,
    registeredBy: "",
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

  const { slots: timeSlots } = useMemo(() => generateWeeklyAxis(weekDays, settings), [weekDays, settings]);
  const weekStartStr = toLocalISOString(weekDays[0]);
  const weekEndStr = toLocalISOString(weekDays[6]);
  const weekAppointments = appointments.filter((b) => b.date >= weekStartStr && b.date <= weekEndStr);

  const getConflicts = (date: string, start: string, end: string) => {
    return appointments.filter((b) => b.date === date && start < b.endTime && end > b.startTime);
  };

  const availableStartTimes = useMemo(() => {
    const rule = getApplicableRule(formData.date, settings);
    if (!rule) return [];
    const schedule = rule.schedules[new Date(formData.date).getDay()];
    if (!schedule || !schedule.isOpen) return [];

    const generateSlots = (startStr: string, endStr: string) => {
      const sParts = startStr.split(":").map(Number);
      const eParts = endStr.split(":").map(Number);
      let sMins = sParts[0] * 60 + sParts[1];
      const eMins = eParts[0] * 60 + eParts[1];
      const slots = [];
      while (sMins <= eMins) {
        const h = Math.floor(sMins / 60);
        const m = sMins % 60;
        slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
        sMins += 30;
      }
      return slots;
    };

    let possibleSlots: string[] = [];
    if (formData.companionCount > 1) {
      possibleSlots = [schedule.morningStartTime, schedule.afternoonStartTime];
    } else {
      possibleSlots = [
        ...generateSlots(schedule.morningStartTime, schedule.morningEndTime),
        ...generateSlots(schedule.afternoonStartTime, schedule.afternoonEndTime)
      ];
    }

    // Filter out conflicts (with 30 min buffer for non-companions)
    return possibleSlots.filter(st => {
      const stMins = Number(st.split(":")[0]) * 60 + Number(st.split(":")[1]);
      const durationMins = formData.companionCount * 60;
      const etMins = stMins + durationMins;
      const etH = Math.floor(etMins / 60);
      const etM = etMins % 60;
      const computedEndTime = `${String(etH).padStart(2, "0")}:${String(etM).padStart(2, "0")}`;

      // Check direct overlaps with actual bookings
      const directConflicts = getConflicts(formData.date, st, computedEndTime);
      if (directConflicts.length > 0) return false;

      // If non-companion, also check if it falls within the 30 min buffer of any existing booking
      if (formData.companionCount === 1) {
        // Find if this slot overlaps with any booking's buffered end time
        const bufferConflicts = appointments.filter(b => {
           if (b.date !== formData.date) return false;
           // If the existing booking was a companion booking, does it have a buffer?
           // The prompt says "若非同行，須給醫師緩衝時間...每位間隔30分鐘".
           // This means if I am booking non-companion, I need a 30m gap from the previous one.
           const bEndMins = Number(b.endTime.split(":")[0]) * 60 + Number(b.endTime.split(":")[1]);
           const bBufferedEndMins = bEndMins + 30; // buffer
           const bBufferedEnd = `${String(Math.floor(bBufferedEndMins / 60)).padStart(2, "0")}:${String(bBufferedEndMins % 60).padStart(2, "0")}`;
           // check overlap of (st, computedEndTime) with (b.startTime, bBufferedEnd)
           return st < bBufferedEnd && computedEndTime > b.startTime;
        });
        if (bufferConflicts.length > 0) return false;
      }
      return true;
    });
  }, [formData.date, formData.companionCount, settings, appointments]);

  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];

  const handleJump2Months = () => {
    const target = new Date();
    target.setMonth(target.getMonth() + 2);
    const targetDateStr = toLocalISOString(target);
    const targetDay = target.getDay();
    
    setFormData(prev => ({ ...prev, date: targetDateStr }));
    setCurrentDate(target);

    const dayEvents = holidays.filter(h => h.date === targetDateStr && h.name !== "補班" && h.type !== "RADIOGRAPHER_NOTE");
    const hasBlockingEvent = dayEvents.some(evt => evt.type === "CLOSED" || evt.type === "NATIONAL");
    const isUnlocked = settings.unlockedDates?.includes(targetDateStr) || false;
    
    const rule = getApplicableRule(targetDateStr, settings);
    
    if (!rule) {
       alert(`⚠️ 提醒您：\n${targetDateStr} (星期${dayNames[targetDay]}) 尚未建立開放規則！請先前往「解說設定」建立適用該區間的規則。`);
       return;
    }
    
    const schedule = rule.schedules[targetDay];
    const isNormallyOpen = schedule.isOpen;
    const finalIsOpen = isNormallyOpen && (!hasBlockingEvent || isUnlocked);
    
    if (dayEvents.length > 0 || !finalIsOpen) {
      alert(`⚠️ 提醒您：\n您跳轉的日期 ${targetDateStr} (星期${dayNames[targetDay]}) \n${!finalIsOpen ? '非基因解說開放日' : '有特殊註記或國定假日'}，可能無法排程，請再次確認！`);
    }

    // Auto-select earliest available time slot based on the daily rule
    if (finalIsOpen && schedule) {
       // Since availableStartTimes hook depends on state, we manually calculate the first available here
       const st = schedule.morningStartTime;
       setFormData(prev => ({ ...prev, startTime: st, date: targetDateStr, medicalRecordNumbers: [""], isOnline: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.medicalRecordNumbers.slice(0, formData.companionCount).some(n => !n.trim()) || !formData.registeredBy.trim()) {
      showToast("請填寫所有病歷號與登記人員", "error");
      return;
    }

    const rule = getApplicableRule(formData.date, settings);
    const day = new Date(formData.date).getDay();
    
    // 防呆：檢查是否為開放日
    if (!rule) {
      showToast("此日期尚未建立開放規則，無法預約", "error");
      return;
    }
    
    const dayEvents = holidays.filter(h => h.date === formData.date && h.name !== "補班" && h.type !== "RADIOGRAPHER_NOTE");
    const hasBlockingEvent = dayEvents.some(evt => evt.type === "CLOSED" || evt.type === "NATIONAL");
    const isUnlocked = settings.unlockedDates?.includes(formData.date) || false;
    const isNormallyOpen = rule.schedules[day]?.isOpen || false;
    const finalIsOpen = isNormallyOpen && (!hasBlockingEvent || isUnlocked);
    
    if (!finalIsOpen) {
      showToast("此日期為非基因解說日或遇特殊註記，無法預約！", "error");
      return;
    }

    const schedule = rule.schedules[day];
    const maxAppts = 1; // Since each slot is dynamically blocked, standard max is 1 booking per slot. Companions consume multiple hours but still count as 1 block booking.

    // Validation for companions
    if (formData.companionCount > 1) {
      if (formData.startTime !== schedule.morningStartTime && formData.startTime !== schedule.afternoonStartTime) {
        showToast(`同行者必須從上午起始(${schedule.morningStartTime})或下午起始(${schedule.afternoonStartTime})開始預約`, "error");
        return;
      }
    }

    // Auto-calculate end time: 1 hr per person
    const startParts = formData.startTime.split(":").map(Number);
    const startMins = startParts[0] * 60 + startParts[1];
    const endMins = startMins + (formData.companionCount * 60);
    const h = Math.floor(endMins / 60);
    const m = endMins % 60;
    const computedEndTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    const conflicts = getConflicts(formData.date, formData.startTime, computedEndTime);
    if (conflicts.length > 0) {
      if (!confirm(`該時段已有預約衝突。確定要重疊預約嗎？`)) return;
    }

    try {
      const newBooking: GeneAppointment = {
        id: generateUUID(),
        date: formData.date,
        startTime: formData.startTime,
        endTime: computedEndTime,
        companionCount: formData.companionCount,
        medicalRecordNumber: formData.medicalRecordNumbers.slice(0, formData.companionCount).map(n => n.trim()).join(","),
        isOnline: formData.isOnline,
        registeredBy: formData.registeredBy,
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
    return Array.from(new Set(names)).slice(0, 5);
  }, [appointments]);

  const handleSettingsSave = async () => {
    try {
      db.settings.geneSettings = settings as any;
      await db.saveSettings();
      showToast("設定已儲存");
    } catch (err) {
      showToast("儲存失敗", "error");
    }
  };

  const handleToggleUnlock = async (dateStr: string) => {
    const current = settings.unlockedDates || [];
    const isUnlocked = current.includes(dateStr);
    const newUnlocked = isUnlocked ? current.filter(d => d !== dateStr) : [...current, dateStr];
    
    const newSettings = { ...settings, unlockedDates: newUnlocked };
    setSettings(newSettings);
    db.settings.geneSettings = newSettings as any;
    await db.saveSettings();
    showToast(isUnlocked ? "已恢復為不開放" : "已解除假日限制，開放預約");
  };

  // Rule Editor State
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const handleAddRule = () => {
    const newRule = createDefaultRule();
    newRule.name = "新規則";
    newRule.startDate = toLocalISOString(new Date());
    setSettings(prev => ({ ...prev, rules: [newRule, ...prev.rules] }));
    setEditingRuleId(newRule.id);
  };

  const handleDeleteRule = (id: string) => {
    if (!confirm("確定要刪除此規則嗎？")) return;
    setSettings(prev => ({ ...prev, rules: prev.rules.filter(r => r.id !== id) }));
  };

  const updateEditingRule = (updateFn: (rule: GeneRule) => GeneRule) => {
    setSettings(prev => ({
      ...prev,
      rules: prev.rules.map(r => r.id === editingRuleId ? updateFn(r) : r)
    }));
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-pink-100 rounded-lg text-pink-600">
              <FileText size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">基因預約系統</h1>
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
            {currentUser.permissions?.includes(PERMISSIONS.EDIT_GENE) && (
              <button
                onClick={() => setActiveTab("settings")}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === "settings" ? "bg-white text-pink-700 shadow-sm" : "text-slate-600"}`}
              >
                <Settings size={16} className="inline mr-1" /> 區間規則設定
              </button>
            )}
          </div>
        </div>

        {toast && (
          <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg font-bold z-[100] animate-fade-in-down ${toast.type === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
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
                        date: toLocalISOString(currentDate),
                        medicalRecordNumbers: [""],
                        startTime: "08:30",
                        companionCount: 1,
                        isOnline: false,
                        registeredBy: ""
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
                    const dateStr = toLocalISOString(date);
                    const rule = getApplicableRule(dateStr, settings);
                    const schedule = rule?.schedules[date.getDay()];
                    const isNormallyOpen = schedule?.isOpen || false;
                    const dayEvents = holidays.filter(h => h.date === dateStr && h.name !== "補班" && h.type !== "RADIOGRAPHER_NOTE");
                    const hasBlockingEvent = dayEvents.some(evt => evt.type === "CLOSED" || evt.type === "NATIONAL");
                    const isUnlocked = settings.unlockedDates?.includes(dateStr) || false;
                    const finalIsOpen = isNormallyOpen && (!hasBlockingEvent || isUnlocked);
                    
                    return (
                      <div
                        key={idx}
                        className={`p-3 text-center border-r border-gray-200 last:border-0 ${isToday ? "bg-pink-50" : ""} ${!finalIsOpen ? "opacity-60 bg-gray-50" : ""}`}
                      >
                        <div className={`text-sm font-bold ${isToday ? "text-pink-700" : "text-gray-700"}`}>
                          星期{dayNames[date.getDay()]}
                        </div>
                        <div className={`text-xs mt-1 ${isToday ? "text-pink-600" : "text-gray-500"}`}>
                          {date.getMonth() + 1}/{date.getDate()}
                        </div>
                        {dayEvents.map((evt, i) => (
                          <div key={i} className={`text-[10px] font-bold px-1 py-0.5 rounded mt-1 ${evt.type === 'DOCTOR_NOTE' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                            {evt.name}
                          </div>
                        ))}
                        {hasBlockingEvent && isNormallyOpen && (
                          <button
                            onClick={() => handleToggleUnlock(dateStr)}
                            className={`mt-1 text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors w-full ${isUnlocked ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                          >
                            {isUnlocked ? '重新鎖定' : '解鎖排程'}
                          </button>
                        )}
                        {!rule && (
                           <div className="text-[10px] bg-slate-200 text-slate-600 font-bold px-1 py-0.5 rounded mt-1">
                             未設規則
                           </div>
                        )}
                        {rule && finalIsOpen && (
                           <div className="text-[10px] text-slate-400 mt-1">
                             {schedule?.morningStartTime}-{schedule?.morningEndTime} / {schedule?.afternoonStartTime}-{schedule?.afternoonEndTime}
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
                        const rule = getApplicableRule(dateStr, settings);
                        const schedule = rule?.schedules[date.getDay()];
                        const isNormallyOpen = schedule?.isOpen || false;
                        const hasBlockingEvent = holidays.some(h => h.date === dateStr && (h.type === "CLOSED" || h.type === "NATIONAL"));
                        const isUnlocked = settings.unlockedDates?.includes(dateStr) || false;
                        const finalIsOpen = isNormallyOpen && (!hasBlockingEvent || isUnlocked);
                        
                        // Check if this specific time is within this day's open hours
                        let isTimeSlotOpen = false;
                        if (finalIsOpen && schedule) {
                           isTimeSlotOpen = (time >= schedule.morningStartTime && time < schedule.morningEndTime) || (time >= schedule.afternoonStartTime && time < schedule.afternoonEndTime);
                        }

                        const slotBookings = weekAppointments.filter(
                          (b) => b.date === dateStr && time >= b.startTime && time < b.endTime
                        );
                        
                        const maxAppts = 1; // dynamically blocked, but standard is 1 per slot
                        const isFull = slotBookings.length >= maxAppts;
                        
                        return (
                          <div
                            key={dayIdx}
                            className={`p-1 border-r border-gray-100 last:border-0 min-h-[60px] relative transition-colors ${!isTimeSlotOpen ? "bg-slate-100/80 cursor-not-allowed" : "hover:bg-pink-50/50 cursor-pointer"}`}
                            onClick={(e) => {
                              if (!isTimeSlotOpen) return; // do nothing if closed
                              if ((e.target as HTMLElement).closest('.booking-card')) return;
                              setFormData({
                                ...formData,
                                date: dateStr,
                                startTime: time,
                                companionCount: 1,
                                medicalRecordNumbers: [""],
                                isOnline: false,
                                registeredBy: "",
                              });
                              setIsModalOpen(true);
                            }}
                          >
                            {slotBookings.map((booking) => (
                              <div
                                key={booking.id}
                                className="booking-card mb-1 p-1.5 bg-pink-100 border border-pink-200 rounded text-[10px] leading-tight group/card relative hover:shadow-md transition-all z-10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFormData({
                                    date: booking.date,
                                    startTime: booking.startTime,
                                    companionCount: booking.companionCount || 1,
                                    medicalRecordNumbers: booking.medicalRecordNumber ? booking.medicalRecordNumber.split(",") : [""],
                                    isOnline: booking.isOnline || false,
                                    registeredBy: booking.registeredBy
                                  });
                                  setIsModalOpen(true);
                                }}
                              >
                                <div className="font-bold text-pink-900 truncate">
                                  {booking.medicalRecordNumber} {booking.isOnline ? "(線上)" : ""}
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
                            {isTimeSlotOpen && !isFull && slotBookings.length > 0 && (
                                <div className="text-[10px] text-pink-400 font-bold text-center mt-1">
                                  尚可約 {maxAppts - slotBookings.length}
                                </div>
                            )}
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
          <div className="flex flex-col gap-4 max-w-5xl">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
              <div className="font-bold text-gray-700 flex items-center gap-2">
                <Settings className="text-pink-500" size={20} /> 管理多組區間規則
              </div>
              <div className="flex gap-2">
                 <button onClick={handleAddRule} className="bg-pink-100 text-pink-700 px-4 py-2 rounded-lg font-bold hover:bg-pink-200 transition-colors text-sm flex items-center gap-1">
                   <Plus size={16} /> 新增規則
                 </button>
                 <button onClick={handleSettingsSave} className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-slate-900 transition-colors text-sm shadow-sm">
                   儲存所有設定
                 </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {settings.rules.map((rule) => {
                const isEditing = editingRuleId === rule.id;
                return (
                  <div key={rule.id} className={`bg-white rounded-xl shadow-sm border transition-all ${isEditing ? 'border-pink-400 ring-1 ring-pink-400' : 'border-gray-200'}`}>
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50 rounded-t-xl">
                      <div className="flex items-center gap-4 flex-1">
                        {isEditing ? (
                           <input type="text" value={rule.name} onChange={(e) => updateEditingRule(r => ({...r, name: e.target.value}))} className="font-bold text-lg px-2 py-1 border border-pink-300 rounded focus:outline-none" />
                        ) : (
                           <div className="font-bold text-lg text-slate-800">{rule.name}</div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-slate-600 bg-white px-3 py-1 rounded-full border border-slate-200">
                           <CalendarIcon size={14} />
                           {isEditing ? (
                              <input type="date" value={rule.startDate} onChange={(e) => updateEditingRule(r => ({...r, startDate: e.target.value}))} className="bg-transparent border-b border-pink-300 focus:outline-none" />
                           ) : (
                              <span>{rule.startDate}</span>
                           )}
                           <span className="text-gray-400">至</span>
                           {isEditing ? (
                              <input type="date" value={rule.endDate} onChange={(e) => updateEditingRule(r => ({...r, endDate: e.target.value}))} className="bg-transparent border-b border-pink-300 focus:outline-none" />
                           ) : (
                              <span>{rule.endDate}</span>
                           )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                         <button onClick={() => setEditingRuleId(isEditing ? null : rule.id)} className={`p-2 rounded transition-colors ${isEditing ? 'bg-pink-100 text-pink-700' : 'text-slate-500 hover:bg-slate-100'}`}>
                           {isEditing ? '完成編輯' : <Edit2 size={16} />}
                         </button>
                         <button onClick={() => handleDeleteRule(rule.id)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded transition-colors">
                           <Trash2 size={16} />
                         </button>
                      </div>
                    </div>
                    
                    {isEditing && (
                      <div className="p-5 space-y-6">
                         <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm mb-4 border border-blue-200">
                           <h4 className="font-bold flex items-center gap-2 mb-2"><FileText size={16} /> 預設排班規則說明：</h4>
                           <ul className="list-decimal pl-5 space-y-1">
                             <li>解說時間：每位 1 小時。</li>
                             <li>若有同行：<br/>
                               - 上午：需從設定的上午起始時間開始，最大量三位。<br/>
                               - 下午：需從設定的下午起始時間開始，最大量三位。
                             </li>
                             <li>若非同行，須給醫師緩衝時間：每位客人需間隔 30 分鐘。<br/>
                               - 上午：最後一位僅能排在上午結束時間。<br/>
                               - 下午：最後一位僅能排在下午結束時間。
                             </li>
                           </ul>
                         </div>

                         <div>
                           <label className="block text-sm font-bold text-slate-700 mb-3">每日詳細開放設定</label>
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                             {rule.schedules.map((schedule, dayIdx) => (
                               <div key={dayIdx} className={`border rounded-lg p-3 ${schedule.isOpen ? 'border-pink-200 bg-pink-50/30' : 'border-gray-200 bg-gray-50'}`}>
                                 <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                                    <span className="font-bold text-slate-700">星期{dayNames[dayIdx]}</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                      <input type="checkbox" className="sr-only peer" checked={schedule.isOpen} onChange={(e) => updateEditingRule(r => {
                                         const ns = [...r.schedules]; ns[dayIdx] = {...ns[dayIdx], isOpen: e.target.checked}; return {...r, schedules: ns};
                                      })} />
                                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-500"></div>
                                    </label>
                                 </div>
                                 <div className={`space-y-3 ${!schedule.isOpen ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <div className="bg-white p-2 rounded border border-gray-100">
                                      <div className="text-xs font-bold text-slate-600 mb-2 border-b pb-1">上午時段</div>
                                      <div className="flex items-center justify-between gap-2 text-xs mb-2">
                                         <span className="text-gray-500 whitespace-nowrap">開始</span>
                                         <input type="time" value={schedule.morningStartTime} onChange={(e) => updateEditingRule(r => {
                                           const ns = [...r.schedules]; ns[dayIdx] = {...ns[dayIdx], morningStartTime: e.target.value}; return {...r, schedules: ns};
                                         })} className="border border-gray-300 rounded px-2 py-1 w-full" />
                                      </div>
                                      <div className="flex items-center justify-between gap-2 text-xs">
                                         <span className="text-gray-500 whitespace-nowrap">最後預約時間</span>
                                         <input type="time" value={schedule.morningEndTime} onChange={(e) => updateEditingRule(r => {
                                           const ns = [...r.schedules]; ns[dayIdx] = {...ns[dayIdx], morningEndTime: e.target.value}; return {...r, schedules: ns};
                                         })} className="border border-gray-300 rounded px-2 py-1 w-full" />
                                      </div>
                                    </div>
                                    
                                    <div className="bg-white p-2 rounded border border-gray-100">
                                      <div className="text-xs font-bold text-slate-600 mb-2 border-b pb-1">下午時段</div>
                                      <div className="flex items-center justify-between gap-2 text-xs mb-2">
                                         <span className="text-gray-500 whitespace-nowrap">開始</span>
                                         <input type="time" value={schedule.afternoonStartTime} onChange={(e) => updateEditingRule(r => {
                                           const ns = [...r.schedules]; ns[dayIdx] = {...ns[dayIdx], afternoonStartTime: e.target.value}; return {...r, schedules: ns};
                                         })} className="border border-gray-300 rounded px-2 py-1 w-full" />
                                      </div>
                                      <div className="flex items-center justify-between gap-2 text-xs">
                                         <span className="text-gray-500 whitespace-nowrap">最後預約時間</span>
                                         <input type="time" value={schedule.afternoonEndTime} onChange={(e) => updateEditingRule(r => {
                                           const ns = [...r.schedules]; ns[dayIdx] = {...ns[dayIdx], afternoonEndTime: e.target.value}; return {...r, schedules: ns};
                                         })} className="border border-gray-300 rounded px-2 py-1 w-full" />
                                      </div>
                                    </div>
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {settings.rules.length === 0 && (
                <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                   尚未建立任何區間規則。
                </div>
              )}
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
                <div className="space-y-2">
                  {Array.from({ length: formData.companionCount }).map((_, idx) => (
                    <input
                      key={idx}
                      type="text"
                      required
                      placeholder={`請輸入病歷號碼 ${idx + 1}`}
                      value={formData.medicalRecordNumbers[idx] || ""}
                      onChange={(e) => {
                        const newArr = [...formData.medicalRecordNumbers];
                        newArr[idx] = e.target.value;
                        setFormData({ ...formData, medicalRecordNumbers: newArr });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">是否要線上解說 *</label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="isOnline"
                      checked={formData.isOnline === true}
                      onChange={() => setFormData({ ...formData, isOnline: true })}
                      className="text-pink-500 focus:ring-pink-500"
                    />
                    <span className="text-sm">是 (線上解說)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="isOnline"
                      checked={formData.isOnline === false}
                      onChange={() => setFormData({ ...formData, isOnline: false })}
                      className="text-pink-500 focus:ring-pink-500"
                    />
                    <span className="text-sm">否 (實體解說)</span>
                  </label>
                </div>
              </div>

              <div>
                 <div className="flex justify-between items-end mb-1">
                   <label className="block text-sm font-bold text-gray-700">預約日期 *</label>
                   <button 
                     type="button" 
                     onClick={handleJump2Months}
                     className="text-xs font-bold text-pink-600 hover:text-pink-800 flex items-center gap-1 bg-pink-50 px-2 py-1 rounded transition-colors"
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
                    {availableStartTimes.length === 0 && <option value="">無可用時段</option>}
                    {availableStartTimes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">預約人數 (含同行) *</label>
                  <select
                    required
                    value={formData.companionCount}
                    onChange={(e) => setFormData({ ...formData, companionCount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                  >
                    <option value={1}>1 人 (非同行)</option>
                    <option value={2}>2 人 (同行)</option>
                    <option value={3}>3 人 (同行)</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">選同行只能從上下午起始時間開始</p>
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
