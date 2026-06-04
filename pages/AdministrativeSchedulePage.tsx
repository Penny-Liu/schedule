import React, { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "../services/supabaseClient";
import { PERMISSIONS, UserRole, DateEventType } from "../types";
import { db } from "../services/store";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Save,
  User,
  UserPlus,
  X,
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Trash2,
  Briefcase,
  FileText,
  MapPin,
  FileSpreadsheet,
  CalendarClock,
  Users,
  Eye,
  EyeOff,
  Edit,
  Check,
  AlertCircle,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ConfirmModal from "../components/ConfirmModal";
import { toLocalISOString, generateUUID } from "../services/utils";

interface AdministrativeSchedulePageProps {
  currentUser: any;
  categories?: AdministrativeCategory[];
  title?: string;
}

const formatDateLocal = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// 行政人員分類
export enum AdministrativeCategory {
  CUSTOMER_SERVICE = "客服",
  GENERAL_AFFAIRS = "智基",
  IT = "資訊",
  REPORTING = "報告",
  ADMIN = "行政",
  GENE = "基因",
}

// 行政建檔人員接口
export interface AdministrativeStaff {
  id: string;
  name: string;
  category: AdministrativeCategory;
  is_active: boolean;
}

// 行政排班接口 - 修改為部門為主
export interface AdministrativeShift {
  id: string;
  category: AdministrativeCategory;
  date: string;
  staffNames: string; // 值班人員名字，多人用逗號分隔
  location: "北投" | "大直";
  notes?: string;
}

const mapShiftFromDb = (row: any): AdministrativeShift => ({
  id: row.id,
  category: row.category,
  date: row.date,
  staffNames: row.staff_names,
  location: row.location,
  notes: row.notes,
});

const mapShiftToDb = (shift: AdministrativeShift) => ({
  id: shift.id,
  category: shift.category,
  date: shift.date,
  staff_names: shift.staffNames,
  location: shift.location,
  notes: shift.notes,
});

const LOCATIONS = ["北投", "大直"];
const SHIFT_TYPES = ["上班"];

const CATEGORY_COLORS: Record<AdministrativeCategory, string> = {
  [AdministrativeCategory.CUSTOMER_SERVICE]: "bg-blue-500 border-blue-600",
  [AdministrativeCategory.GENERAL_AFFAIRS]: "bg-green-500 border-green-600",
  [AdministrativeCategory.IT]: "bg-purple-500 border-purple-600",
  [AdministrativeCategory.REPORTING]: "bg-orange-500 border-orange-600",
  [AdministrativeCategory.ADMIN]: "bg-gray-500 border-gray-600",
  [AdministrativeCategory.GENE]: "bg-pink-500 border-pink-600",
};

const AdministrativeSchedulePage: React.FC<AdministrativeSchedulePageProps> = ({
  currentUser,
  categories,
  title = "行政排班管理",
}) => {
  const displayCategories = categories || Object.values(AdministrativeCategory);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    db.loadDataForMonth(currentDate.getFullYear(), currentDate.getMonth() + 1);
  }, [currentDate]);
  const [shifts, setShifts] = useState<AdministrativeShift[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [isDirty, setIsDirty] = useState(false);
  const [holidays, setHolidays] = useState(() => db.getHolidays());

  // 人員管理相關狀態
  const [staffList, setStaffList] = useState<AdministrativeStaff[]>([]);
  const [showStaffManager, setShowStaffManager] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffCategory, setNewStaffCategory] =
    useState<AdministrativeCategory>(displayCategories[0]);
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);

  const [editingCell, setEditingCell] = useState<{
    category: AdministrativeCategory;
    date: string;
  } | null>(null);

  // 人員視角與快速排班狀態
  const [viewMode, setViewMode] = useState<"department" | "personnel">(
    "department",
  );
  const [isQuickMode, setIsQuickMode] = useState(false);
  const [quickLocation, setQuickLocation] = useState<"北投" | "大直" | "清除">(
    "北投",
  );
  const [personnelEditingCell, setPersonnelEditingCell] = useState<{
    staff: AdministrativeStaff;
    date: string;
    currentLocation: "北投" | "大直" | null;
  } | null>(null);

  // 用於編輯與快速選擇的狀態
  const [historicalNames, setHistoricalNames] = useState<
    Record<string, string[]>
  >({});
  const [editStaffBeitou, setEditStaffBeitou] = useState("");
  const [editStaffDazhi, setEditStaffDazhi] = useState("");
  const [activeEditField, setActiveEditField] = useState<"北投" | "大直">(
    "北投",
  );

  // 自動偵測當前是否為純「基因排班」頁面，使用專屬權限
  const isGeneOnly =
    categories?.length === 1 && categories[0] === AdministrativeCategory.GENE;
  const requiredPermission = isGeneOnly
    ? "EDIT_GENE"
    : PERMISSIONS.EDIT_ADMINISTRATIVE;

  const canEdit =
    currentUser?.role === UserRole.SYSTEM_ADMIN ||
    currentUser?.permissions?.includes(requiredPermission);

  // 追蹤未儲存狀態，用於攔截頁面切換或關閉
  useEffect(() => {
    (window as any).isAdministrativeDirty = isDirty;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      (window as any).isAdministrativeDirty = false;
    };
  }, [isDirty]);

  // 載入全院假日設定
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setHolidays([...db.getHolidays()]);
    });
    Promise.all([db.initializeAuthData(), db.currentUser ? db.initializeDataForUser(db.currentUser) : Promise.resolve()]).then(() => {
      setHolidays([...db.getHolidays()]);
    });
    return () => unsubscribe();
  }, []);

  // 載入排班資料
  useEffect(() => {
    loadShifts();
    loadStaff();
  }, [currentDate]);

  const loadStaff = async () => {
    let query = supabase
      .from("administrative_staff")
      .select("id, name, category, is_active")
      .eq("is_active", true);
    if (categories) {
      query = query.in("category", categories);
    }
    const { data, error } = await query;
    if (!error && data) setStaffList(data);
  };

  const loadShifts = async () => {
    const startDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    const endDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
    );

    try {
      let query = supabase
        .from("administrative_shifts")
        .select("id, category, date, staff_names, location, notes")
        .gte("date", formatDateLocal(startDate))
        .lte("date", formatDateLocal(endDate));
      if (categories) {
        query = query.in("category", categories);
      }

      const { data, error } = await query;

      if (error) throw error;
      setShifts((data || []).map(mapShiftFromDb));
      setIsDirty(false);
    } catch (error) {
      console.error("載入排班資料失敗:", error);
    }
  };

  // 載入歷史常用人員名單
  useEffect(() => {
    const fetchHistoricalNames = async () => {
      try {
        // 取得最近的 1000 筆排班紀錄來提煉常用名單
        let query = supabase
          .from("administrative_shifts")
          .select("category, staff_names")
          .order("created_at", { ascending: false })
          .limit(2000);
        if (categories) {
          query = query.in("category", categories);
        }

        const { data, error } = await query;

        if (!error && data) {
          const nameMap: Record<string, Set<string>> = {};
          displayCategories.forEach((c) => (nameMap[c] = new Set()));

          data.forEach((row: any) => {
            if (row.category && nameMap[row.category] && row.staff_names) {
              row.staff_names.split(",").forEach((n: string) => {
                const trimmed = n.trim();
                if (trimmed) nameMap[row.category].add(trimmed);
              });
            }
          });

          const result: Record<string, string[]> = {};
          for (const cat in nameMap) {
            result[cat] = Array.from(nameMap[cat]).sort();
          }
          setHistoricalNames(result);
        }
      } catch (err) {
        console.error("載入歷史人員名單失敗:", err);
      }
    };
    fetchHistoricalNames();
  }, []);

  // 獲取指定日期和部門的所有班別 (支援北投與大直同時存在)
  const getShiftsForDateAndCategory = (
    category: AdministrativeCategory,
    dateStr: string,
  ) => {
    return shifts.filter((s) => s.category === category && s.date === dateStr);
  };

  // 處理月份切換，攔截未儲存狀態
  const handleMonthChange = (direction: 1 | -1) => {
    if (isDirty) {
      if (!window.confirm("您有未儲存的排班變更，確定要放棄並切換月份嗎？")) {
        return;
      }
    }
    setCurrentDate(
      new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + direction,
        1,
      ),
    );
    setIsDirty(false);
  };

  // 匯出為 PDF
  const exportToPDF = () => {
    const pdf = new jsPDF();
    const monthName = currentDate.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
    });

    pdf.setFontSize(16);
    pdf.text(`${title} - ${monthName}`, 20, 20);

    const tableData =
      viewMode === "department"
        ? displayCategories.map((category) => {
            const categoryShifts = shifts.filter(
              (s) => s.category === category,
            );
            const row: any[] = [category];

            // 為每一天添加值班人員
            for (let day = 1; day <= daysInMonth; day++) {
              const dateObj = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth(),
                day,
              );
              const dateStr = formatDateLocal(dateObj);
              const dayShifts = categoryShifts.filter(
                (s) => s.date === dateStr,
              );
              if (dayShifts.length > 0) {
                const text = dayShifts
                  .map((s) => {
                    const formattedNames = s.staffNames
                      .split(",")
                      .map((n) => n.trim())
                      .filter(Boolean)
                      .join("\n");
                    return `${formattedNames}\n(${s.location})`;
                  })
                  .join("\n---\n");
                row.push(text);
              } else {
                row.push("");
              }
            }
            return row;
          })
        : staffList
            .filter((s) => displayCategories.includes(s.category))
            .map((staff) => {
              const row: any[] = [staff.name];
              for (let day = 1; day <= daysInMonth; day++) {
                const dateObj = new Date(
                  currentDate.getFullYear(),
                  currentDate.getMonth(),
                  day,
                );
                const dateStr = formatDateLocal(dateObj);
                let assignedLoc = "";
                const shiftsForDateAndCat = shifts.filter(
                  (s) => s.category === staff.category && s.date === dateStr,
                );
                shiftsForDateAndCat.forEach((s) => {
                  if (
                    s.staffNames
                      .split(",")
                      .map((n) => n.trim())
                      .includes(staff.name)
                  )
                    assignedLoc = s.location;
                });
                row.push(assignedLoc);
              }
              return row;
            });

    autoTable(pdf, {
      head: [
        [
          viewMode === "department" ? "部門" : "人員",
          ...Array.from({ length: daysInMonth }, (_, i) => `${i + 1}日`),
        ],
      ],
      body: tableData,
      startY: 30,
      didParseCell: (data: any) => {
        if (data.column.index >= 1) {
          const day = data.column.index;
          const dateObj = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            day,
          );
          const dateStr = toLocalISOString(dateObj);
          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
          const isNationalHoliday = holidays.some(
            (h) =>
              h.date === dateStr &&
              (h.type === DateEventType.NATIONAL ||
                h.type === DateEventType.CLOSED),
          );

          if (isWeekend || isNationalHoliday) {
            if (data.section === "head") {
              data.cell.styles.textColor = [239, 68, 68]; // 標題紅字
            } else if (data.section === "body") {
              data.cell.styles.fillColor = [254, 242, 242]; // 欄位淺紅底色
            }
          }
        }
      },
    });

    pdf.save(`${title}_${monthName}.pdf`);
  };

  // 處理人員視角下的格子點擊（快速排班切換）
  const handleToggleStaff = (
    staff: AdministrativeStaff,
    dateStr: string,
    targetLoc: "北投" | "大直" | null,
  ) => {
    setShifts((prev) => {
      let newShifts = [...prev];

      // 1. 先將這個人從該部門當天的所有排班中移除
      const relevantShifts = newShifts.filter(
        (s) => s.category === staff.category && s.date === dateStr,
      );
      for (const s of relevantShifts) {
        const names = s.staffNames
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);
        const filteredNames = names.filter((n) => n !== staff.name);

        if (filteredNames.length === 0) {
          newShifts = newShifts.filter((x) => x.id !== s.id);
        } else {
          const idx = newShifts.findIndex((x) => x.id === s.id);
          newShifts[idx] = {
            ...newShifts[idx],
            staffNames: filteredNames.join(", "),
          };
        }
      }

      // 2. 如果有指定新地點，將他加進去
      if (targetLoc) {
        const targetShiftIdx = newShifts.findIndex(
          (s) =>
            s.category === staff.category &&
            s.date === dateStr &&
            s.location === targetLoc,
        );
        if (targetShiftIdx >= 0) {
          const names = newShifts[targetShiftIdx].staffNames
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean);
          if (!names.includes(staff.name)) {
            names.push(staff.name);
            newShifts[targetShiftIdx] = {
              ...newShifts[targetShiftIdx],
              staffNames: names.join(", "),
            };
          }
        } else {
          newShifts.push({
            id: generateUUID(),
            category: staff.category,
            date: dateStr,
            staffNames: staff.name,
            location: targetLoc,
          });
        }
      }

      return newShifts;
    });
    setIsDirty(true);
  };

  // 儲存排班資料到 Supabase
  const saveShifts = async () => {
    setIsLoading(true);
    try {
      // 1. 取得當月資料庫中原有的排班 ID (用來比對哪些被刪除了)
      const startDate = formatDateLocal(
        new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
      );
      const endDate = formatDateLocal(
        new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0),
      );

      let fetchQuery = supabase
        .from("administrative_shifts")
        .select("id")
        .gte("date", startDate)
        .lte("date", endDate);
      if (categories) {
        fetchQuery = fetchQuery.in("category", categories);
      }

      const { data: existingData, error: fetchError } = await fetchQuery;

      if (fetchError) throw fetchError;

      const existingIds = existingData?.map((d) => d.id) || [];
      const currentIds = shifts.map((s) => s.id);
      const idsToDelete = existingIds.filter((id) => !currentIds.includes(id));

      // 2. 刪除被清空的排班
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("administrative_shifts")
          .delete()
          .in("id", idsToDelete);
        if (deleteError) throw deleteError;
      }

      // 3. 新增或更新現在的排班
      if (shifts.length > 0) {
        const dbShifts = shifts.map(mapShiftToDb);
        const { error: upsertError } = await supabase
          .from("administrative_shifts")
          .upsert(dbShifts, { onConflict: "category,date,location" });
        if (upsertError) throw upsertError;
      }

      setIsDirty(false);
      alert("排班已成功儲存！");
    } catch (error: any) {
      console.error("儲存排班失敗:", error);
      alert("儲存失敗：" + (error.message || "未知錯誤"));
    } finally {
      setIsLoading(false);
    }
  };

  // 新增人員
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || isSubmittingStaff) return;
    setIsSubmittingStaff(true);
    const { data, error } = await supabase
      .from("administrative_staff")
      .insert([
        {
          name: newStaffName.trim(),
          category: newStaffCategory,
          is_active: true,
        },
      ])
      .select();
    if (!error && data) {
      setStaffList([...staffList, data[0]]);
      setNewStaffName("");
    }
    setIsSubmittingStaff(false);
  };

  // 停用/刪除人員
  const handleDeleteStaff = async (id: string) => {
    if (!window.confirm("確定要移除此固定人員嗎？")) return;
    const { error } = await supabase
      .from("administrative_staff")
      .update({ is_active: false })
      .eq("id", id);
    if (!error) setStaffList(staffList.filter((s) => s.id !== id));
  };

  // 計算當月天數
  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0,
  ).getDate();

  return (
    <div className="h-full flex flex-col bg-gray-50 relative">
      <div className="flex-1 overflow-auto p-4 pb-24">
        <div className="max-w-7xl mx-auto">
          {/* 頁面標題 */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Briefcase className="w-8 h-8 text-blue-600" />
              {title}
            </h1>
            <p className="text-gray-600 mt-1">
              管理人員排班，支援快速假日排班功能
            </p>
          </div>

          {/* 控制面板 */}
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* 月份導航 */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleMonthChange(-1)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-lg font-semibold min-w-[120px] text-center">
                  {currentDate.toLocaleDateString("zh-TW", {
                    year: "numeric",
                    month: "long",
                  })}
                </span>
                <button
                  onClick={() => handleMonthChange(1)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* 視角切換與快速排班 */}
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                  <button
                    onClick={() => {
                      setViewMode("department");
                      setIsQuickMode(false);
                    }}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === "department" ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    部門視角
                  </button>
                  <button
                    onClick={() => setViewMode("personnel")}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === "personnel" ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    人員視角
                  </button>
                </div>

                {viewMode === "personnel" && canEdit && (
                  <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                    <button
                      onClick={() => setIsQuickMode(!isQuickMode)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all border flex items-center gap-1 ${
                        isQuickMode
                          ? "bg-indigo-600 text-white border-indigo-700 shadow-sm"
                          : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      快速排班 {isQuickMode && "ON"}
                    </button>
                    {isQuickMode && (
                      <select
                        value={quickLocation}
                        onChange={(e) =>
                          setQuickLocation(
                            e.target.value as "北投" | "大直" | "清除",
                          )
                        }
                        className="px-2 py-1.5 text-sm border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg outline-none font-bold"
                      >
                        {LOCATIONS.map((loc) => (
                          <option key={loc} value={loc}>
                            {loc}
                          </option>
                        ))}
                        <option value="清除">清除</option>
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* 操作按鈕 */}
              <div className="flex items-center gap-2">
                {canEdit && (
                  <>
                    <button
                      onClick={() => setShowStaffManager(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm"
                    >
                      <Users className="w-4 h-4" />
                      人員管理
                    </button>
                    <button
                      onClick={saveShifts}
                      disabled={isLoading}
                      className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg disabled:opacity-50 transition-all shadow-sm ${
                        isDirty
                          ? "bg-amber-500 hover:bg-amber-600 animate-pulse ring-2 ring-amber-300 ring-offset-1"
                          : "bg-green-600 hover:bg-green-700"
                      }`}
                    >
                      <Save className="w-4 h-4" />
                      {isLoading
                        ? "儲存中..."
                        : isDirty
                          ? "尚未儲存！"
                          : "儲存排班"}
                    </button>
                  </>
                )}
                <button
                  onClick={exportToPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  匯出PDF
                </button>
              </div>
            </div>
          </div>

          {/* 排班表格 */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden flex flex-col">
            <div className="overflow-auto max-h-[70vh]">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-30 shadow-sm bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 top-0 bg-gray-50 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-gray-200 border-b">
                      {viewMode === "department" ? "部門" : "人員"}
                    </th>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const date = new Date(
                        currentDate.getFullYear(),
                        currentDate.getMonth(),
                        i + 1,
                      );
                      const dateStr = formatDateLocal(date);
                      const isWeekend =
                        date.getDay() === 0 || date.getDay() === 6;
                      const holidayEvent = holidays.find(
                        (h) =>
                          h.date === dateStr &&
                          (h.type === DateEventType.NATIONAL ||
                            h.type === DateEventType.CLOSED),
                      );
                      const isHoliday = isWeekend || !!holidayEvent;
                      return (
                        <th
                          key={i}
                          className={`px-2 py-3 text-center text-xs font-medium uppercase tracking-wider min-w-[60px] sticky top-0 z-20 border-b border-gray-200 border-r ${isHoliday ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-500"}`}
                        >
                          {i + 1}
                          <br />
                          <span className="text-xs">
                            (
                            {
                              ["日", "一", "二", "三", "四", "五", "六"][
                                date.getDay()
                              ]
                            }
                            )
                          </span>
                          {holidayEvent && (
                            <div
                              className="text-[10px] mt-1 px-1 rounded-sm bg-red-100 text-red-700 truncate max-w-[50px] mx-auto leading-tight"
                              title={holidayEvent.name}
                            >
                              {holidayEvent.name}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {viewMode === "department"
                    ? displayCategories.map((category) => (
                        <tr
                          key={category}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-3 whitespace-nowrap sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-gray-100">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${CATEGORY_COLORS[category]}`}
                              >
                                {category.charAt(0)}
                              </div>
                              <span className="font-medium text-gray-900">
                                {category}
                              </span>
                            </div>
                          </td>
                          {Array.from({ length: daysInMonth }, (_, i) => {
                            const dateObj = new Date(
                              currentDate.getFullYear(),
                              currentDate.getMonth(),
                              i + 1,
                            );
                            const dateStr = formatDateLocal(dateObj);
                            const isWeekend =
                              dateObj.getDay() === 0 || dateObj.getDay() === 6;
                            const holidayEvent = holidays.find(
                              (h) =>
                                h.date === dateStr &&
                                (h.type === DateEventType.NATIONAL ||
                                  h.type === DateEventType.CLOSED),
                            );
                            const isHoliday = isWeekend || !!holidayEvent;

                            const dayShifts = getShiftsForDateAndCategory(
                              category,
                              dateStr,
                            );
                            return (
                              <td
                                key={i}
                                onClick={() => {
                                  if (canEdit) {
                                    setEditingCell({
                                      category,
                                      date: dateStr,
                                    });
                                    const bShift = dayShifts.find(
                                      (s) => s.location === "北投",
                                    );
                                    const dShift = dayShifts.find(
                                      (s) => s.location === "大直",
                                    );
                                    setEditStaffBeitou(
                                      bShift?.staffNames || "",
                                    );
                                    setEditStaffDazhi(dShift?.staffNames || "");
                                    setActiveEditField(
                                      bShift?.staffNames
                                        ? "北投"
                                        : dShift?.staffNames
                                          ? "大直"
                                          : "北投",
                                    );
                                  }
                                }}
                                className={`px-2 py-3 text-center border-r border-gray-100 ${canEdit ? "cursor-pointer hover:bg-blue-50 transition-colors" : ""} ${isHoliday && dayShifts.length === 0 ? "bg-red-50/40 hover:bg-red-100/50" : ""}`}
                              >
                                {dayShifts.length > 0 ? (
                                  <div className="text-xs flex flex-col items-center">
                                    {dayShifts.map((shift, sIdx) => (
                                      <div
                                        key={shift.id}
                                        className={`flex flex-col items-center w-full ${sIdx > 0 ? "mt-1 pt-1 border-t border-gray-200" : ""}`}
                                      >
                                        <div className="font-medium text-gray-800 flex flex-col">
                                          {shift.staffNames
                                            .split(",")
                                            .map((name, nameIdx) => {
                                              const trimmed = name.trim();
                                              if (!trimmed) return null;
                                              return (
                                                <span
                                                  key={nameIdx}
                                                  className="whitespace-nowrap"
                                                >
                                                  {trimmed}
                                                </span>
                                              );
                                            })}
                                        </div>
                                        <div className="text-gray-500 text-[10px] mt-0.5">
                                          ({shift.location})
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    : staffList
                        .filter((s) => displayCategories.includes(s.category))
                        .map((staff) => (
                          <tr
                            key={staff.id}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="px-4 py-3 whitespace-nowrap sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-gray-100">
                              <div className="font-bold text-gray-900">
                                {staff.name}
                              </div>
                              <div className="text-[10px] text-gray-500">
                                {staff.category}
                              </div>
                            </td>
                            {Array.from({ length: daysInMonth }, (_, i) => {
                              const dateObj = new Date(
                                currentDate.getFullYear(),
                                currentDate.getMonth(),
                                i + 1,
                              );
                              const dateStr = toLocalISOString(dateObj);
                              const isWeekend =
                                dateObj.getDay() === 0 ||
                                dateObj.getDay() === 6;
                              const holidayEvent = holidays.find(
                                (h) =>
                                  h.date === dateStr &&
                                  (h.type === DateEventType.NATIONAL ||
                                    h.type === DateEventType.CLOSED),
                              );
                              const isHoliday = isWeekend || !!holidayEvent;

                              const shiftsForDateAndCat = shifts.filter(
                                (s) =>
                                  s.category === staff.category &&
                                  s.date === dateStr,
                              );
                              let assignedLoc: "北投" | "大直" | null = null;
                              shiftsForDateAndCat.forEach((s) => {
                                const names = s.staffNames
                                  .split(",")
                                  .map((n) => n.trim());
                                if (names.includes(staff.name)) {
                                  assignedLoc = s.location;
                                }
                              });

                              return (
                                <td
                                  key={i}
                                  onClick={() => {
                                    if (!canEdit) return;
                                    if (isQuickMode) {
                                      handleToggleStaff(
                                        staff,
                                        dateStr,
                                        quickLocation === "清除"
                                          ? null
                                          : assignedLoc === quickLocation
                                            ? null
                                            : (quickLocation as
                                                | "北投"
                                                | "大直"),
                                      );
                                    } else {
                                      setPersonnelEditingCell({
                                        staff,
                                        date: dateStr,
                                        currentLocation: assignedLoc,
                                      });
                                    }
                                  }}
                                  className={`px-1 py-2 text-center border-r border-gray-100 transition-colors ${canEdit ? "cursor-pointer" : ""} ${assignedLoc === "北投" ? "bg-blue-50 hover:bg-blue-100" : assignedLoc === "大直" ? "bg-orange-50 hover:bg-orange-100" : isHoliday ? "bg-red-50/40 hover:bg-red-100/50" : "hover:bg-gray-50"}`}
                                >
                                  {assignedLoc ? (
                                    <span
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${assignedLoc === "北投" ? "text-blue-700 bg-blue-100 border border-blue-200 shadow-sm" : "text-orange-700 bg-orange-100 border border-orange-200 shadow-sm"}`}
                                    >
                                      {assignedLoc}
                                    </span>
                                  ) : (
                                    <span className="text-gray-200 hover:text-gray-400 opacity-0 hover:opacity-100 transition-opacity select-none">
                                      +
                                    </span>
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

          {/* 單日排班編輯模態框 */}
          {editingCell && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-sm">
                <h3 className="text-lg font-semibold mb-4">
                  編輯排班 - {editingCell.category}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  日期: {editingCell.date}
                </p>
                <div className="space-y-4">
                  <div>
                    <label
                      className={`block text-sm font-medium mb-1 ${activeEditField === "北投" ? "text-blue-600" : "text-gray-700"}`}
                    >
                      北投 值班人員 {activeEditField === "北投" && "(編輯中)"}
                    </label>
                    <input
                      type="text"
                      className={`w-full px-3 py-2 border rounded-md outline-none transition-colors ${activeEditField === "北投" ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50" : "border-gray-300 focus:border-blue-300"}`}
                      value={editStaffBeitou}
                      onFocus={() => setActiveEditField("北投")}
                      onChange={(e) => setEditStaffBeitou(e.target.value)}
                      placeholder="輸入北投值班人員，多人用逗號分隔"
                    />
                  </div>
                  <div>
                    <label
                      className={`block text-sm font-medium mb-1 ${activeEditField === "大直" ? "text-orange-600" : "text-gray-700"}`}
                    >
                      大直 值班人員 {activeEditField === "大直" && "(編輯中)"}
                    </label>
                    <input
                      type="text"
                      className={`w-full px-3 py-2 border rounded-md outline-none transition-colors ${activeEditField === "大直" ? "ring-2 ring-orange-500 border-orange-500 bg-orange-50" : "border-gray-300 focus:border-orange-300"}`}
                      value={editStaffDazhi}
                      onFocus={() => setActiveEditField("大直")}
                      onChange={(e) => setEditStaffDazhi(e.target.value)}
                      placeholder="輸入大直值班人員，多人用逗號分隔"
                    />
                  </div>

                  {/* 常用人員快速點擊區 */}
                  {(() => {
                    const currentCategoryNames = new Set([
                      ...(historicalNames[editingCell.category] || []),
                      ...staffList
                        .filter((s) => s.category === editingCell.category)
                        .map((s) => s.name),
                    ]);
                    // 只用歷史名單 + 固定人員，不依賴當月 shifts（避免換月 reset）
                    const availableNames =
                      Array.from(currentCategoryNames).sort();

                    if (availableNames.length === 0) return null;

                    const currentNames = (
                      activeEditField === "北投"
                        ? editStaffBeitou
                        : editStaffDazhi
                    )
                      .split(",")
                      .map((n) => n.trim())
                      .filter(Boolean);

                    return (
                      <div className="pt-1">
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                          固定名單與常用人員 (點擊快速帶入)
                        </label>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 custom-scrollbar">
                          {availableNames.map((name) => {
                            const isSelected = currentNames.includes(name);
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => {
                                  const newNames = isSelected
                                    ? currentNames.filter((n) => n !== name)
                                    : [...currentNames, name];
                                  const joined = newNames.join(", ");
                                  if (activeEditField === "北投") {
                                    setEditStaffBeitou(joined);
                                  } else {
                                    setEditStaffDazhi(joined);
                                  }
                                }}
                                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                                  isSelected
                                    ? activeEditField === "北投"
                                      ? "bg-blue-500 text-white border-blue-600 shadow-sm"
                                      : "bg-orange-500 text-white border-orange-600 shadow-sm"
                                    : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                                }`}
                              >
                                {name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => {
                      setShifts((prev) =>
                        prev.filter(
                          (s) =>
                            !(
                              s.category === editingCell.category &&
                              s.date === editingCell.date
                            ),
                        ),
                      );
                      setIsDirty(true);
                      setEditingCell(null);
                    }}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
                  >
                    清空此日排班
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingCell(null)}
                      className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        setShifts((prev) => {
                          const next = prev.filter(
                            (s) =>
                              !(
                                s.category === editingCell.category &&
                                s.date === editingCell.date
                              ),
                          );
                          const oldBeitou = prev.find(
                            (s) =>
                              s.category === editingCell.category &&
                              s.date === editingCell.date &&
                              s.location === "北投",
                          );
                          const oldDazhi = prev.find(
                            (s) =>
                              s.category === editingCell.category &&
                              s.date === editingCell.date &&
                              s.location === "大直",
                          );

                          if (editStaffBeitou.trim()) {
                            next.push({
                              id: oldBeitou?.id || generateUUID(),
                              category: editingCell.category,
                              date: editingCell.date,
                              staffNames: editStaffBeitou.trim(),
                              location: "北投",
                            });
                          }
                          if (editStaffDazhi.trim()) {
                            next.push({
                              id: oldDazhi?.id || generateUUID(),
                              category: editingCell.category,
                              date: editingCell.date,
                              staffNames: editStaffDazhi.trim(),
                              location: "大直",
                            });
                          }
                          return next;
                        });
                        setIsDirty(true);
                        setEditingCell(null);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                    >
                      確定
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 人員單格視角編輯框 */}
          {personnelEditingCell && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-sm animate-in zoom-in-95 duration-200">
                <h3 className="text-lg font-bold text-gray-800 mb-1">
                  指派人員 - {personnelEditingCell.staff.name}
                </h3>
                <p className="text-sm text-gray-500 mb-5">
                  日期: {personnelEditingCell.date}
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => {
                      handleToggleStaff(
                        personnelEditingCell.staff,
                        personnelEditingCell.date,
                        "北投",
                      );
                      setPersonnelEditingCell(null);
                    }}
                    className={`px-4 py-3 rounded-lg font-bold border transition-colors ${personnelEditingCell.currentLocation === "北投" ? "bg-blue-500 text-white border-blue-600 shadow-md" : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"}`}
                  >
                    上班 (北投)
                  </button>
                  <button
                    onClick={() => {
                      handleToggleStaff(
                        personnelEditingCell.staff,
                        personnelEditingCell.date,
                        "大直",
                      );
                      setPersonnelEditingCell(null);
                    }}
                    className={`px-4 py-3 rounded-lg font-bold border transition-colors ${personnelEditingCell.currentLocation === "大直" ? "bg-orange-500 text-white border-orange-600 shadow-md" : "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"}`}
                  >
                    上班 (大直)
                  </button>
                  <div className="h-px bg-gray-100 my-1"></div>
                  <button
                    onClick={() => {
                      handleToggleStaff(
                        personnelEditingCell.staff,
                        personnelEditingCell.date,
                        null,
                      );
                      setPersonnelEditingCell(null);
                    }}
                    className={`px-4 py-3 rounded-lg font-bold border transition-colors ${personnelEditingCell.currentLocation === null ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" : "bg-white text-red-600 border-red-200 hover:bg-red-50"}`}
                  >
                    清除 / 標記為休假
                  </button>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setPersonnelEditingCell(null)}
                    className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 確認模態框 */}
          <ConfirmModal
            isOpen={showConfirmModal}
            title="確認刪除"
            message="確定要刪除這個人員嗎？此操作會將人員標記為非活躍狀態。"
            onConfirm={confirmAction}
            onClose={() => setShowConfirmModal(false)}
          />

          {/* 人員管理模態框 */}
          {showStaffManager && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-indigo-50">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Users size={18} className="text-indigo-600" />{" "}
                    各部門固定人員管理
                  </h3>
                  <button
                    onClick={() => setShowStaffManager(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar">
                  <form
                    onSubmit={handleAddStaff}
                    className="flex flex-wrap md:flex-nowrap gap-2 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-100"
                  >
                    <input
                      type="text"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      placeholder="輸入人員姓名"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[150px]"
                      required
                    />
                    <select
                      value={newStaffCategory}
                      onChange={(e) =>
                        setNewStaffCategory(
                          e.target.value as AdministrativeCategory,
                        )
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      {displayCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={isSubmittingStaff}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Plus size={16} /> 新增人員
                    </button>
                  </form>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayCategories.map((cat) => {
                      const catStaff = staffList.filter(
                        (s) => s.category === cat,
                      );
                      if (catStaff.length === 0) return null;
                      return (
                        <div
                          key={cat}
                          className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm"
                        >
                          <h4 className="font-bold text-sm text-gray-700 border-b pb-2 mb-2">
                            {cat}{" "}
                            <span className="text-gray-400 font-normal text-xs">
                              ({catStaff.length})
                            </span>
                          </h4>
                          <div className="flex flex-col gap-2">
                            {catStaff.map((staff) => (
                              <div
                                key={staff.id}
                                className="flex justify-between items-center bg-gray-50 px-2 py-1.5 rounded border border-gray-100 hover:border-indigo-200 transition-colors"
                              >
                                <span className="text-sm font-medium text-gray-700">
                                  {staff.name}
                                </span>
                                <button
                                  onClick={() => handleDeleteStaff(staff.id)}
                                  className="text-red-400 hover:text-red-600 p-1"
                                  title="刪除"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdministrativeSchedulePage;
