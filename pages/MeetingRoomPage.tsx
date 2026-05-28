import React, { useState, useMemo, useEffect, useRef } from "react";
import { User, UserRole, DateEventType, MeetingRoomBooking } from "../types";
import { db } from "../services/store";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Clock,
  Building2,
  FileText,
  Trash2,
  List as ListIcon,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { toLocalISOString, generateUUID } from "../services/utils";

interface MeetingRoomPageProps {
  currentUser: User;
}

// 產生 08:00 - 17:00 的半小時區間列表
const generateTimeSlots = () => {
  const slots = [];
  for (let h = 8; h < 17; h++) {
    const hourStr = String(h).padStart(2, "0");
    slots.push(`${hourStr}:00`);
    slots.push(`${hourStr}:30`);
  }
  slots.push("17:00"); // 包含結束的節點
  return slots;
};
const TIME_SLOTS = generateTimeSlots();

// 依照租借單位取得專屬主題色
const getUnitColorTheme = (unit: string) => {
  const u = unit || "";
  if (u.includes("基因")) {
    return {
      cardBg: "bg-pink-50 hover:bg-pink-100",
      cardBorder: "border-pink-500",
      textMain: "text-pink-900",
      textSub: "text-pink-700",
      textMuted: "text-pink-500",
      icon: "text-pink-400 hover:text-red-500",
      badge: "bg-pink-100 border-pink-200 text-pink-700",
      listBg: "bg-white hover:bg-pink-50",
    };
  }
  if (u.includes("業務")) {
    return {
      cardBg: "bg-orange-50 hover:bg-orange-100",
      cardBorder: "border-orange-500",
      textMain: "text-orange-900",
      textSub: "text-orange-700",
      textMuted: "text-orange-500",
      icon: "text-orange-400 hover:text-red-500",
      badge: "bg-orange-100 border-orange-200 text-orange-700",
      listBg: "bg-white hover:bg-orange-50",
    };
  }
  if (u.includes("資訊") || u.includes("IT")) {
    return {
      cardBg: "bg-purple-50 hover:bg-purple-100",
      cardBorder: "border-purple-500",
      textMain: "text-purple-900",
      textSub: "text-purple-700",
      textMuted: "text-purple-500",
      icon: "text-purple-400 hover:text-red-500",
      badge: "bg-purple-100 border-purple-200 text-purple-700",
      listBg: "bg-white hover:bg-purple-50",
    };
  }
  if (
    u.includes("護理") ||
    u.includes("健管") ||
    u.includes("門診") ||
    u.includes("醫療")
  ) {
    return {
      cardBg: "bg-emerald-50 hover:bg-emerald-100",
      cardBorder: "border-emerald-500",
      textMain: "text-emerald-900",
      textSub: "text-emerald-700",
      textMuted: "text-emerald-500",
      icon: "text-emerald-400 hover:text-red-500",
      badge: "bg-emerald-100 border-emerald-200 text-emerald-700",
      listBg: "bg-white hover:bg-emerald-50",
    };
  }
  if (u.includes("客服")) {
    return {
      cardBg: "bg-blue-50 hover:bg-blue-100",
      cardBorder: "border-blue-500",
      textMain: "text-blue-900",
      textSub: "text-blue-700",
      textMuted: "text-blue-500",
      icon: "text-blue-400 hover:text-red-500",
      badge: "bg-blue-100 border-blue-200 text-blue-700",
      listBg: "bg-white hover:bg-blue-50",
    };
  }
  if (
    u.includes("行政") ||
    u.includes("人資") ||
    u.includes("財務") ||
    u.includes("管理")
  ) {
    return {
      cardBg: "bg-slate-100 hover:bg-slate-200",
      cardBorder: "border-slate-500",
      textMain: "text-slate-900",
      textSub: "text-slate-700",
      textMuted: "text-slate-500",
      icon: "text-slate-400 hover:text-red-500",
      badge: "bg-slate-200 border-slate-300 text-slate-700",
      listBg: "bg-white hover:bg-slate-50",
    };
  }
  // Default (Indigo)
  return {
    cardBg: "bg-indigo-50 hover:bg-indigo-100",
    cardBorder: "border-indigo-500",
    textMain: "text-indigo-900",
    textSub: "text-indigo-700",
    textMuted: "text-indigo-500",
    icon: "text-indigo-400 hover:text-red-500",
    badge: "bg-indigo-100 border-indigo-200 text-indigo-600",
    listBg: "bg-white hover:bg-indigo-50",
  };
};

const MeetingRoomPage: React.FC<MeetingRoomPageProps> = ({ currentUser }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    db.loadDataForMonth(currentDate.getFullYear(), currentDate.getMonth() + 1);
  }, [currentDate]);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // 與 Supabase 串接的真實資料庫狀態
  const [bookings, setBookings] = useState<MeetingRoomBooking[]>(() =>
    db.getMeetingRoomBookings(),
  );

  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setBookings([...db.getMeetingRoomBookings()]);
    });
    db.initializeAuthData(true); if (db.currentUser) db.initializeDataForUser(db.currentUser, true); // 確保重新整理時會抓取資料
    return () => unsubscribe();
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: toLocalISOString(new Date()),
    startTime: "08:00",
    endTime: "08:30",
    unit: "",
    purpose: "",
  });

  // Toast 提示狀態
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000); // 3秒後自動消失
  };

  // 重複預約相關狀態
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceUnit, setRecurrenceUnit] = useState<
    "day" | "week" | "month"
  >("week");
  const [recurrenceMonthType, setRecurrenceMonthType] = useState<
    "date" | "weekday"
  >("date");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [skipHolidays, setSkipHolidays] = useState(true);

  // 取得系統全域的國定假日設定
  const [holidays, setHolidays] = useState(() => db.getHolidays());

  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setHolidays([...db.getHolidays()]);
    });
    return () => unsubscribe();
  }, []);

  // 取得當前選擇日期所在的那一週 (週一至週日)
  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // 將週一設為一週的開始
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
  const weekBookings = bookings.filter(
    (b) => b.date >= weekStartStr && b.date <= weekEndStr,
  );

  const dateDetails = useMemo(() => {
    if (!formData.date) return { day: 1, nth: 1, name: "一" };
    const [y, m, d] = formData.date.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    return {
      day: d,
      nth: Math.ceil(d / 7),
      name: ["日", "一", "二", "三", "四", "五", "六"][dateObj.getDay()],
    };
  }, [formData.date]);

  // 處理自訂日期跳轉
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      const [y, m, d] = val.split("-").map(Number);
      setCurrentDate(new Date(y, m - 1, d));
    }
  };

  // 取得衝突的預約紀錄
  const getConflicts = (date: string, start: string, end: string) => {
    const dayBookings = bookings.filter((b) => b.date === date);
    return dayBookings.filter((b) => {
      // 如果新預約的開始時間早於已預約的結束時間，且新預約的結束時間晚於已預約的開始時間，即為衝突
      return start < b.endTime && end > b.startTime;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.startTime >= formData.endTime) {
      showToast("結束時間必須晚於開始時間", "error");
      return;
    }

    let targetDates = [formData.date];

    if (isRecurring && recurrenceEndDate) {
      targetDates = [];
      const [y, m, d] = formData.date.split("-").map(Number);
      const startD = new Date(y, m - 1, d);
      let curr = new Date(y, m - 1, d);
      const [ey, em, ed] = recurrenceEndDate.split("-").map(Number);
      const end = new Date(ey, em - 1, ed);

      const startDayOfWeek = startD.getDay();
      const startNthWeek = Math.ceil(startD.getDate() / 7);

      while (curr <= end) {
        const dStr = toLocalISOString(curr);
        let shouldSkip = false;
        if (skipHolidays) {
          const isWeekend = curr.getDay() === 0 || curr.getDay() === 6;
          const isHoliday = holidays.some(
            (h) =>
              h.date === dStr &&
              (h.type === DateEventType.NATIONAL ||
                h.type === DateEventType.CLOSED),
          );
          if (isWeekend || isHoliday) shouldSkip = true;
        }
        if (!shouldSkip) {
          targetDates.push(dStr);
        }

        const interval = Math.max(1, recurrenceInterval);
        if (recurrenceUnit === "day") {
          curr.setDate(curr.getDate() + interval);
        } else if (recurrenceUnit === "week") {
          curr.setDate(curr.getDate() + interval * 7);
        } else if (recurrenceUnit === "month") {
          if (recurrenceMonthType === "date") {
            curr.setMonth(curr.getMonth() + interval);
          } else {
            let nextDate = new Date(
              curr.getFullYear(),
              curr.getMonth() + interval,
              1,
            );
            const expectedMonth = nextDate.getMonth();
            while (nextDate.getDay() !== startDayOfWeek) {
              nextDate.setDate(nextDate.getDate() + 1);
            }
            nextDate.setDate(nextDate.getDate() + (startNthWeek - 1) * 7);
            if (nextDate.getMonth() !== expectedMonth) {
              nextDate.setDate(nextDate.getDate() - 7);
            }
            curr = nextDate;
          }
        }
      }
    }

    const newBookings: MeetingRoomBooking[] = [];
    const conflictDates: string[] = [];
    const conflictDetails: MeetingRoomBooking[] = [];

    for (const dStr of targetDates) {
      const conflicts = getConflicts(
        dStr,
        formData.startTime,
        formData.endTime,
      );
      if (conflicts.length > 0) {
        conflictDates.push(dStr);
        conflictDetails.push(...conflicts);
      } else {
        newBookings.push({
          id: generateUUID(),
          date: dStr,
          startTime: formData.startTime,
          endTime: formData.endTime,
          unit: formData.unit,
          purpose: formData.purpose,
          userId: currentUser.id,
        });
      }
    }

    if (newBookings.length === 0) {
      if (isRecurring) {
        showToast("所有選擇的日期皆有衝突或為假日，無法預約。", "error");
      } else if (conflictDetails.length > 0) {
        const c = conflictDetails[0];
        showToast(
          `該時段已由「${c.unit}」預約 (${c.purpose})，請選擇其他時間。`,
          "error",
        );
      } else {
        showToast("該時段已有其他預約，請選擇其他時間", "error");
      }
      return;
    }

    if (conflictDates.length > 0) {
      const c = conflictDetails[0];
      const confirmMsg = `發現衝突！\n\n其中 ${conflictDates.length} 天的時段已由「${c.unit}」等單位預約，將被略過:\n${conflictDates.slice(0, 3).join(", ")}${conflictDates.length > 3 ? "..." : ""}\n\n確定要預約其餘沒有衝突的 ${newBookings.length} 天嗎？`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    try {
      await db.addMeetingRoomBookings(newBookings);
      showToast("預約成功！", "success");
    } catch (error) {
      showToast("新增預約至資料庫失敗，請重試", "error");
    }
    setIsModalOpen(false);
    setFormData({
      date: toLocalISOString(currentDate),
      startTime: "08:00",
      endTime: "08:30",
      unit: "",
      purpose: "",
    });
    setIsRecurring(false);
    setRecurrenceInterval(1);
    setRecurrenceUnit("week");
    setRecurrenceMonthType("date");
  };

  const handleDelete = (id: string) => {
    const booking = bookings.find((b) => b.id === id);
    if (!booking) return;
    if (
      booking.userId !== currentUser.id &&
      currentUser.role !== UserRole.SYSTEM_ADMIN
    ) {
      showToast("您沒有權限取消此預約！只有預約人才能取消。", "error");
      return;
    }
    if (window.confirm("確定要取消此預約嗎？")) {
      // 尋找未來的重複排程
      const futureMatches = bookings.filter(
        (b) =>
          b.date > booking.date &&
          b.unit === booking.unit &&
          b.purpose === booking.purpose &&
          b.startTime === booking.startTime &&
          b.endTime === booking.endTime &&
          b.userId === booking.userId,
      );

      let idsToDelete = [id];

      if (futureMatches.length > 0) {
        // 整理即將被刪除的日期清單，最多顯示前 10 筆
        const futureDatesStr =
          futureMatches
            .map((b) => b.date)
            .sort()
            .slice(0, 10)
            .join(", ") +
          (futureMatches.length > 10
            ? ` ...等共 ${futureMatches.length} 天`
            : "");

        if (
          window.confirm(
            `系統發現此預約在未來還有 ${futureMatches.length} 筆相同的常態排程。\n\n即將被連動取消的日期：\n${futureDatesStr}\n\n是否要「一併取消」所有未來的重複預約？\n(按確定：刪除此筆及未來共 ${futureMatches.length + 1} 筆，按取消：僅刪除此筆)`,
          )
        ) {
          idsToDelete = [...idsToDelete, ...futureMatches.map((b) => b.id)];
        }
      }

      Promise.all(
        idsToDelete.map((delId) => db.deleteMeetingRoomBooking(delId)),
      )
        .then(() =>
          showToast(
            idsToDelete.length > 1
              ? `已成功取消 ${idsToDelete.length} 筆預約`
              : "預約已取消",
            "success",
          ),
        )
        .catch(() => showToast("刪除失敗", "error"));
    }
  };

  const handleOpenModalForSlot = (date: string, time: string) => {
    // 自動帶入結束時間 (加半小時)
    const idx = TIME_SLOTS.indexOf(time);
    const endTime = idx < TIME_SLOTS.length - 1 ? TIME_SLOTS[idx + 1] : time;
    setFormData({ ...formData, date, startTime: time, endTime: endTime });
    setIsRecurring(false);
    setRecurrenceInterval(1);
    setRecurrenceUnit("week");
    setRecurrenceMonthType("date");
    setSkipHolidays(true);
    setIsModalOpen(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="text-teal-600" size={28} />
            會議室租借系統
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            預約時間為 08:00 ~ 17:00，以半小時為單位
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl shadow-sm border border-slate-200">
            <button
              onClick={() =>
                setCurrentDate(
                  new Date(currentDate.setDate(currentDate.getDate() - 7)),
                )
              }
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-500"
            >
              <ChevronLeft size={20} />
            </button>
            <div
              className="relative font-bold text-slate-700 min-w-[200px] text-center text-sm cursor-pointer hover:text-teal-600 transition-colors flex items-center justify-center gap-1.5 group select-none"
              onClick={() =>
                dateInputRef.current?.showPicker
                  ? dateInputRef.current.showPicker()
                  : dateInputRef.current?.click()
              }
              title="點擊選擇日期"
            >
              {weekDays[0].toLocaleDateString("zh-TW", {
                month: "short",
                day: "numeric",
              })}{" "}
              ~{" "}
              {weekDays[6].toLocaleDateString("zh-TW", {
                month: "short",
                day: "numeric",
              })}
              <CalendarIcon
                size={14}
                className="text-slate-400 group-hover:text-teal-500"
              />
              <input
                ref={dateInputRef}
                type="date"
                className="absolute opacity-0 invisible"
                value={toLocalISOString(currentDate)}
                onChange={handleDateChange}
              />
            </div>
            <button
              onClick={() =>
                setCurrentDate(
                  new Date(currentDate.setDate(currentDate.getDate() + 7)),
                )
              }
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-500"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <button
            onClick={() => setCurrentDate(new Date())}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-xl text-sm font-bold transition-all shadow-sm hidden md:block"
            title="回到本週"
          >
            本週
          </button>

          <button
            onClick={() => {
              setFormData({
                date: toLocalISOString(currentDate),
                startTime: "08:00",
                endTime: "08:30",
                unit: "",
                purpose: "",
              });
              setIsRecurring(false);
              setRecurrenceInterval(1);
              setRecurrenceUnit("week");
              setRecurrenceMonthType("date");
              setSkipHolidays(true);
              setIsModalOpen(true);
            }}
            className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all"
          >
            <Plus size={16} /> 新增預約
          </button>
        </div>
      </div>

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        {/* Left: Weekly Calendar Grid */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="flex bg-slate-50 border-b border-slate-200">
            <div className="w-16 shrink-0 border-r border-slate-200"></div>
            {weekDays.map((d) => {
              const dateStr = toLocalISOString(d);
              const isToday = dateStr === toLocalISOString(new Date());
              const isSunday = d.getDay() === 0;
              const isSaturday = d.getDay() === 6;
              const holiday = holidays.find(
                (h) =>
                  h.date === dateStr &&
                  (h.type === DateEventType.NATIONAL ||
                    h.type === DateEventType.CLOSED),
              );

              const isRed = isSunday || !!holiday;
              const isGreen = isSaturday && !isRed;

              let textColorClass = "text-slate-500";
              let dateColorClass = "text-slate-700";
              let bgColorClass = "";

              if (isToday) {
                textColorClass = "text-teal-600";
                dateColorClass = "text-teal-600";
                bgColorClass = "bg-teal-50";
              } else if (isRed) {
                textColorClass = "text-red-500";
                dateColorClass = "text-red-600";
                bgColorClass = "bg-red-50/50";
              } else if (isGreen) {
                textColorClass = "text-emerald-500";
                dateColorClass = "text-emerald-600";
                bgColorClass = "bg-emerald-50/50";
              }

              return (
                <div
                  key={d.toISOString()}
                  className={`flex-1 text-center py-2 border-r border-slate-200 font-bold ${dateColorClass} ${bgColorClass}`}
                >
                  <div className={`text-[11px] ${textColorClass}`}>
                    {d.toLocaleDateString("zh-TW", { weekday: "short" })}
                  </div>
                  <div className={`text-sm ${dateColorClass}`}>
                    {d.getDate()}
                  </div>
                  {holiday && (
                    <div
                      className="text-[9px] mt-0.5 px-1 rounded-sm bg-red-100 text-red-700 truncate max-w-[60px] mx-auto leading-tight"
                      title={holiday.name}
                    >
                      {holiday.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex">
            {/* Time Axis */}
            <div
              className="w-16 shrink-0 border-r border-slate-200 relative mt-4 mb-4"
              style={{ height: `${(TIME_SLOTS.length - 1) * 60}px` }}
            >
              {TIME_SLOTS.map((time, idx) => (
                <span
                  key={time}
                  className="absolute right-2 text-[11px] font-bold text-slate-500 bg-white px-1 -translate-y-1/2 z-10"
                  style={{ top: `${idx * 60}px` }}
                >
                  {time}
                </span>
              ))}
            </div>

            {/* Days Axis */}
            {weekDays.map((d) => {
              const dateStr = toLocalISOString(d);
              const dayBookings = weekBookings.filter(
                (b) => b.date === dateStr,
              );

              const isToday = dateStr === toLocalISOString(new Date());
              const isSunday = d.getDay() === 0;
              const isSaturday = d.getDay() === 6;
              const holiday = holidays.find(
                (h) =>
                  h.date === dateStr &&
                  (h.type === DateEventType.NATIONAL ||
                    h.type === DateEventType.CLOSED),
              );
              const isRed = isSunday || !!holiday;
              const isGreen = isSaturday && !isRed;
              let slotBgClass = "";
              if (isToday) slotBgClass = "bg-teal-50/10";
              else if (isRed) slotBgClass = "bg-red-50/10";
              else if (isGreen) slotBgClass = "bg-emerald-50/10";

              return (
                <div
                  key={dateStr}
                  className="flex-1 border-r border-slate-200 relative min-w-[80px] mt-4 mb-4"
                >
                  {/* Empty slots for click to add */}
                  {TIME_SLOTS.slice(0, -1).map((slot, idx) => (
                    <div
                      key={slot}
                      onClick={() => handleOpenModalForSlot(dateStr, slot)}
                      className={`absolute w-full h-[60px] border-t border-slate-100 hover:bg-teal-50/80 hover:border-teal-300 cursor-pointer transition-all group/slot z-0 ${slotBgClass}`}
                      style={{ top: `${idx * 60}px` }}
                    >
                      <div className="opacity-0 group-hover/slot:opacity-100 flex items-center justify-center h-full text-teal-700 font-bold text-xs">
                        <Plus size={14} className="mr-1" /> {slot}
                      </div>
                    </div>
                  ))}

                  {/* Bottom line for the last time slot */}
                  <div
                    className="absolute w-full border-t border-slate-100"
                    style={{ top: `${(TIME_SLOTS.length - 1) * 60}px` }}
                  ></div>

                  {/* Bookings */}
                  {dayBookings.map((b) => {
                    const startIdx = TIME_SLOTS.indexOf(b.startTime);
                    const endIdx = TIME_SLOTS.indexOf(b.endTime);
                    const top = startIdx * 60;
                    const height = (endIdx - startIdx) * 60;
                    const canDelete =
                      b.userId === currentUser.id ||
                      currentUser.role === UserRole.SYSTEM_ADMIN;

                    const theme = getUnitColorTheme(b.unit);

                    return (
                      <div
                        key={b.id}
                        className="absolute w-full px-0.5 py-0.5 z-10"
                        style={{ top: `${top}px`, height: `${height}px` }}
                      >
                        <div
                          className={`w-full h-full border-l-[4px] rounded-r p-1.5 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-all cursor-default ${theme.cardBg} ${theme.cardBorder}`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <div
                              className={`font-bold text-[11px] truncate leading-tight ${theme.textMain}`}
                            >
                              {b.unit}
                            </div>
                            {canDelete && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(b.id);
                                }}
                                className={`opacity-0 group-hover:opacity-100 shrink-0 bg-white rounded p-0.5 shadow-sm transition-colors ${theme.icon}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                          <div
                            className={`text-[10px] truncate leading-tight mt-0.5 ${theme.textSub}`}
                          >
                            {b.purpose}
                          </div>
                          <div
                            className={`text-[9px] font-medium mt-auto flex items-center gap-0.5 ${theme.textMuted}`}
                          >
                            <Clock size={10} /> {b.startTime}-{b.endTime}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Weekly Summary List */}
        <div className="w-full lg:w-72 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[400px] lg:h-auto shrink-0">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <ListIcon size={18} className="text-teal-600" />
              本週借用清單
            </h3>
            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
              {weekBookings.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {weekBookings.length === 0 ? (
              <div className="text-center text-slate-400 text-sm mt-10">
                本週尚無預約
              </div>
            ) : (
              [...weekBookings]
                .sort(
                  (a, b) =>
                    a.date.localeCompare(b.date) ||
                    a.startTime.localeCompare(b.startTime),
                )
                .map((b) => {
                  const now = new Date();
                  const todayStr = toLocalISOString(now);
                  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
                  const isPast =
                    b.date < todayStr ||
                    (b.date === todayStr && b.endTime <= nowTime);

                  const theme = getUnitColorTheme(b.unit);

                  return (
                    <div
                      key={b.id}
                      className={`p-3 border rounded-xl transition-colors ${isPast ? "bg-slate-50 border-slate-100 opacity-50 grayscale" : `border-slate-100 ${theme.listBg}`}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="font-bold text-slate-800 text-sm">
                          {b.unit}
                        </div>
                        <div
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${theme.badge}`}
                        >
                          {b.date.substring(5)}
                        </div>
                      </div>
                      <div className="text-xs text-slate-600 mb-2">
                        {b.purpose}
                      </div>
                      <div className="text-xs font-bold text-slate-500 flex items-center gap-1">
                        <Clock size={12} /> {b.startTime} - {b.endTime}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>

      {/* Booking Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <CalendarIcon size={20} className="text-teal-600" />
                會議室預約
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  日期
                </label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    開始時間
                  </label>
                  <select
                    value={formData.startTime}
                    onChange={(e) =>
                      setFormData({ ...formData, startTime: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    {TIME_SLOTS.slice(0, -1).map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    結束時間
                  </label>
                  <select
                    value={formData.endTime}
                    onChange={(e) =>
                      setFormData({ ...formData, endTime: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    {TIME_SLOTS.slice(1).map((time) => (
                      <option
                        key={time}
                        value={time}
                        disabled={time <= formData.startTime}
                      >
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  租借單位
                </label>
                <input
                  type="text"
                  required
                  value={formData.unit}
                  onChange={(e) =>
                    setFormData({ ...formData, unit: e.target.value })
                  }
                  placeholder="例如：影像醫學部"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  會議目的
                </label>
                <input
                  type="text"
                  required
                  value={formData.purpose}
                  onChange={(e) =>
                    setFormData({ ...formData, purpose: e.target.value })
                  }
                  placeholder="例如：跨部門月會"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => {
                      setIsRecurring(e.target.checked);
                      if (e.target.checked && !recurrenceEndDate) {
                        const d = new Date(formData.date);
                        d.setMonth(d.getMonth() + 3); // 預設重複三個月
                        setRecurrenceEndDate(toLocalISOString(d));
                      }
                    }}
                    className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                  />
                  <span className="text-sm font-bold text-slate-700">
                    重複預約
                  </span>
                </label>

                {isRecurring && (
                  <div className="pl-6 space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">
                        重複頻率
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-600">
                          每
                        </span>
                        <input
                          type="number"
                          min="1"
                          value={recurrenceInterval}
                          onChange={(e) =>
                            setRecurrenceInterval(parseInt(e.target.value) || 1)
                          }
                          className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 bg-white text-sm text-center"
                        />
                        <select
                          value={recurrenceUnit}
                          onChange={(e) =>
                            setRecurrenceUnit(e.target.value as any)
                          }
                          className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 bg-white text-sm"
                        >
                          <option value="day">天</option>
                          <option value="week">週</option>
                          <option value="month">月</option>
                        </select>
                      </div>

                      {recurrenceUnit === "month" && (
                        <div className="mt-2 flex flex-col gap-2 pl-1 bg-white p-2 rounded border border-slate-100">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              checked={recurrenceMonthType === "date"}
                              onChange={() => setRecurrenceMonthType("date")}
                              className="text-teal-600 focus:ring-teal-500"
                            />
                            <span className="text-xs text-slate-600 font-bold">
                              依日期 (每月 {dateDetails.day} 日)
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              checked={recurrenceMonthType === "weekday"}
                              onChange={() => setRecurrenceMonthType("weekday")}
                              className="text-teal-600 focus:ring-teal-500"
                            />
                            <span className="text-xs text-slate-600 font-bold">
                              依星期 (每個月的第 {dateDetails.nth} 個星期
                              {dateDetails.name})
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">
                        重複至 (包含此日)
                      </label>
                      <input
                        type="date"
                        required={isRecurring}
                        min={formData.date}
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 bg-white text-sm"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipHolidays}
                        onChange={(e) => setSkipHolidays(e.target.checked)}
                        className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                      />
                      <span className="text-xs font-bold text-slate-600">
                        自動排除週末與國定假日/休診日
                      </span>
                    </label>
                  </div>
                )}
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-white bg-teal-600 hover:bg-teal-700 rounded-lg font-bold shadow-md transition-all active:scale-95"
                >
                  確認預約
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3 animate-in slide-in-from-bottom-5 z-[10000] ${toast.type === "success" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"}`}
        >
          {toast.type === "success" ? (
            <CheckCircle size={20} className="text-emerald-600" />
          ) : (
            <AlertTriangle size={20} className="text-red-600" />
          )}
          <span className="font-bold text-sm">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default MeetingRoomPage;
