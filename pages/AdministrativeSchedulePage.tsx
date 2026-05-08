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
}

// 行政人員分類
export enum AdministrativeCategory {
  CUSTOMER_SERVICE = "客服",
  GENERAL_AFFAIRS = "智基",
  IT = "資訊",
  REPORTING = "報告",
  ADMIN = "行政",
}

// 行政人員接口
export interface AdministrativeStaff {
  id: string;
  name: string;
  category: AdministrativeCategory;
  isActive: boolean;
  hireDate?: string;
  terminationDate?: string;
  displayOrder?: number;
  phone?: string;
}

const mapStaffFromDb = (row: any): AdministrativeStaff => ({
  id: row.id,
  name: row.name,
  category: row.category,
  isActive: row.is_active,
  hireDate: row.hire_date,
  terminationDate: row.termination_date,
  displayOrder: row.display_order,
  phone: row.phone,
});

const mapStaffToDb = (staff: AdministrativeStaff) => ({
  id: staff.id,
  name: staff.name,
  category: staff.category,
  is_active: staff.isActive,
  hire_date: staff.hireDate,
  termination_date: staff.terminationDate,
  display_order: staff.displayOrder,
  phone: staff.phone,
});

// 行政排班接口
export interface AdministrativeShift {
  id: string;
  staffId: string;
  date: string;
  shiftType: string; // 改為統一使用 "上班"，保留 string 兼容舊資料
  location: "北投" | "大直";
  notes?: string;
}

const mapShiftFromDb = (row: any): AdministrativeShift => ({
  id: row.id,
  staffId: row.staff_id,
  date: row.date,
  shiftType: row.shift_type,
  location: row.location,
  notes: row.notes,
});

const mapShiftToDb = (shift: AdministrativeShift) => ({
  id: shift.id,
  staff_id: shift.staffId,
  date: shift.date,
  shift_type: shift.shiftType,
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
};

const AdministrativeSchedulePage: React.FC<AdministrativeSchedulePageProps> = ({
  currentUser,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [staffList, setStaffList] = useState<AdministrativeStaff[]>([]);
  const [shifts, setShifts] = useState<AdministrativeShift[]>([]);
  const [selectedStaff, setSelectedStaff] =
    useState<AdministrativeStaff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<AdministrativeStaff | null>(
    null,
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [isDirty, setIsDirty] = useState(false);
  const [holidays, setHolidays] = useState(() => db.getHolidays());

  const [editingCell, setEditingCell] = useState<{
    staff: AdministrativeStaff;
    date: string;
    shift?: AdministrativeShift;
  } | null>(null);

  const canEdit =
    currentUser?.role === UserRole.SYSTEM_ADMIN ||
    currentUser?.permissions?.includes(PERMISSIONS.EDIT_ADMINISTRATIVE);

  const staffGroups = useMemo(() => {
    const categories = Object.values(AdministrativeCategory);
    return categories
      .map((category) => ({
        category,
        members: staffList.filter((staff) => staff.category === category),
      }))
      .filter((group) => group.members.length > 0);
  }, [staffList]);

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
      setHolidays(db.getHolidays());
    });
    db.initializeData().then(() => {
      setHolidays(db.getHolidays());
    });
    return () => unsubscribe();
  }, []);

  // 載入行政人員和排班資料
  useEffect(() => {
    loadStaff();
    loadShifts();
  }, [currentDate]);

  const loadStaff = async () => {
    try {
      const { data, error } = await supabase
        .from("administrative_staff")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setStaffList((data || []).map(mapStaffFromDb));
    } catch (error) {
      console.error("載入行政人員失敗:", error);
    }
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
      const { data, error } = await supabase
        .from("administrative_shifts")
        .select("*")
        .gte("date", startDate.toISOString().split("T")[0])
        .lte("date", endDate.toISOString().split("T")[0]);

      if (error) throw error;
      setShifts((data || []).map(mapShiftFromDb));
      setIsDirty(false);
    } catch (error) {
      console.error("載入排班資料失敗:", error);
    }
  };

  // 儲存排班
  const saveShifts = async () => {
    setIsLoading(true);
    try {
      // 先刪除當月的舊資料
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

      await supabase
        .from("administrative_shifts")
        .delete()
        .gte("date", startDate.toISOString().split("T")[0])
        .lte("date", endDate.toISOString().split("T")[0]);

      // 插入新資料
      if (shifts.length > 0) {
        const dbShifts = shifts.map(mapShiftToDb);
        const { error } = await supabase
          .from("administrative_shifts")
          .insert(dbShifts);

        if (error) throw error;
      }

      setIsDirty(false);
      alert("儲存成功！");
    } catch (error) {
      console.error("儲存失敗:", error);
      const message =
        error && typeof error === "object" && "message" in error
          ? (error as any).message
          : JSON.stringify(error);
      alert(`儲存失敗：${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 新增/編輯行政人員
  const saveStaff = async (staff: AdministrativeStaff) => {
    try {
      const { error } = await supabase
        .from("administrative_staff")
        .upsert(mapStaffToDb(staff));

      if (error) throw error;

      setShowStaffModal(false);
      setEditingStaff(null);
      loadStaff();
    } catch (error) {
      console.error("儲存人員失敗:", error);
      const message =
        error && typeof error === "object" && "message" in error
          ? (error as any).message
          : JSON.stringify(error);
      alert(`儲存失敗：${message}`);
    }
  };

  // 刪除行政人員
  const deleteStaff = async (staffId: string) => {
    setConfirmAction(() => async () => {
      try {
        const { error } = await supabase
          .from("administrative_staff")
          .update({ is_active: false })
          .eq("id", staffId);

        if (error) throw error;

        loadStaff();
        setShowConfirmModal(false);
      } catch (error) {
        console.error("刪除人員失敗:", error);
        alert("刪除失敗，請重試");
      }
    });
    setShowConfirmModal(true);
  };

  // 快速排班功能
  const quickSchedule = (
    staff: AdministrativeStaff,
    shiftType: string,
    location: string,
  ) => {
    const daysInMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
    ).getDate();

    const newShifts: AdministrativeShift[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        day,
      );
      const dateStr = date.toISOString().split("T")[0];

      // 檢查是否為假日（週六、日）
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isNationalHoliday = holidays.some(
        (h) =>
          h.date === dateStr &&
          (h.type === DateEventType.NATIONAL ||
            h.type === DateEventType.CLOSED),
      );

      // 快速排班預設只排平日與非國定假日 (若要排假日可透過點擊單格手動新增)
      if (isWeekend || isNationalHoliday) continue;

      // 檢查是否已存在排班
      const existingShift = shifts.find(
        (s) =>
          s.staffId === staff.id &&
          s.date === dateStr &&
          s.location === location,
      );

      if (!existingShift) {
        newShifts.push({
          id: generateUUID(),
          staffId: staff.id,
          date: dateStr,
          shiftType: shiftType as any,
          location: location as any,
        });
      }
    }

    if (newShifts.length > 0) {
      setShifts((prev) => [...prev, ...newShifts]);
      setIsDirty(true);
    }
  };

  // 匯出為 PDF
  const exportToPDF = () => {
    const pdf = new jsPDF();
    const monthName = currentDate.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
    });

    pdf.setFontSize(16);
    pdf.text(`行政排班表 - ${monthName}`, 20, 20);

    const tableData = staffList.map((staff) => {
      const staffShifts = shifts.filter((s) => s.staffId === staff.id);
      const row = [staff.name, staff.category];

      // 為每一天添加班別
      const daysInMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
      ).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          day,
        )
          .toISOString()
          .split("T")[0];
        const shift = staffShifts.find((s) => s.date === dateStr);
        row.push(shift ? `${shift.shiftType}(${shift.location})` : "");
      }

      return row;
    });

    autoTable(pdf, {
      head: [
        [
          "姓名",
          "分類",
          ...Array.from(
            {
              length: new Date(
                currentDate.getFullYear(),
                currentDate.getMonth() + 1,
                0,
              ).getDate(),
            },
            (_, i) => `${i + 1}日`,
          ),
        ],
      ],
      body: tableData,
      startY: 30,
      didParseCell: (data: any) => {
        if (data.column.index >= 2) {
          const day = data.column.index - 1;
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

    pdf.save(`行政排班表_${monthName}.pdf`);
  };

  // 計算月份的天數
  const daysInMonth = useMemo(() => {
    return new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
    ).getDate();
  }, [currentDate]);

  // 獲取指定日期的班別
  const getShiftForDate = (staffId: string, dateStr: string) => {
    return shifts.find((s) => s.staffId === staffId && s.date === dateStr);
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

  return (
    <div className="h-full flex flex-col bg-gray-50 relative">
      <div className="flex-1 overflow-auto p-4 pb-24">
        <div className="max-w-7xl mx-auto">
          {/* 頁面標題 */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Briefcase className="w-8 h-8 text-blue-600" />
              行政排班管理
            </h1>
            <p className="text-gray-600 mt-1">
              管理行政人員排班，支援快速假日排班功能
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

              {/* 操作按鈕 */}
              <div className="flex items-center gap-2">
                {canEdit && (
                  <>
                    <button
                      onClick={() => {
                        setEditingStaff(null);
                        setShowStaffModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <UserPlus className="w-4 h-4" />
                      新增人員
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

          {/* 快速排班面板 */}
          {selectedStaff && canEdit && (
            <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <User className="w-5 h-5" />
                快速排班 - {selectedStaff.name} ({selectedStaff.category})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {SHIFT_TYPES.map((shiftType) => (
                  <div key={shiftType} className="space-y-2">
                    <h4 className="font-medium text-sm">{shiftType}</h4>
                    <div className="flex gap-2">
                      {LOCATIONS.map((location) => (
                        <button
                          key={location}
                          onClick={() =>
                            quickSchedule(selectedStaff, shiftType, location)
                          }
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                        >
                          {location}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setSelectedStaff(null)}
                className="mt-4 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                取消選擇
              </button>
            </div>
          )}

          {/* 排班表格 */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden flex flex-col">
            <div className="overflow-auto max-h-[70vh]">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-30 shadow-sm bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 top-0 bg-gray-50 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-gray-200 border-b">
                      人員
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 sticky top-0 z-20 border-r border-gray-200 border-b">
                      分類
                    </th>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const date = new Date(
                        currentDate.getFullYear(),
                        currentDate.getMonth(),
                        i + 1,
                      );
                      const dateStr = date.toISOString().split("T")[0];
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
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 top-0 bg-gray-50 z-30 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] border-l border-gray-200 border-b">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {staffGroups.map((group) => (
                    <React.Fragment key={group.category}>
                      <tr className="bg-gray-100">
                        <td
                          colSpan={3 + daysInMonth}
                          className="px-4 py-2 text-left text-sm font-bold text-gray-700 bg-slate-100 sticky left-0 z-10"
                        >
                          {group.category}
                        </td>
                      </tr>
                      {group.members.map((staff) => (
                        <tr
                          key={staff.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-3 whitespace-nowrap sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-gray-100">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  setSelectedStaff(
                                    selectedStaff?.id === staff.id
                                      ? null
                                      : staff,
                                  )
                                }
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${CATEGORY_COLORS[staff.category]}`}
                              >
                                {staff.name.charAt(0)}
                              </button>
                              <span className="font-medium text-gray-900">
                                {staff.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${CATEGORY_COLORS[staff.category]} text-white`}
                            >
                              {staff.category}
                            </span>
                          </td>
                          {Array.from({ length: daysInMonth }, (_, i) => {
                            const dateStr = new Date(
                              currentDate.getFullYear(),
                              currentDate.getMonth(),
                              i + 1,
                            )
                              .toISOString()
                              .split("T")[0];
                            const shift = getShiftForDate(staff.id, dateStr);
                            return (
                              <td
                                key={i}
                                onClick={() => {
                                  if (canEdit) {
                                    setEditingCell({
                                      staff,
                                      date: dateStr,
                                      shift,
                                    });
                                  }
                                }}
                                className={`px-2 py-3 text-center border-r border-gray-100 ${canEdit ? "cursor-pointer hover:bg-blue-50 transition-colors" : ""}`}
                              >
                                {shift ? (
                                  <div className="text-xs">
                                    <div className="font-medium text-gray-800">
                                      {shift.shiftType}
                                    </div>
                                    <div className="text-gray-500 text-[10px]">
                                      ({shift.location})
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-center whitespace-nowrap sticky right-0 bg-white z-10 border-l shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            {canEdit ? (
                              <div className="flex items-center gap-2 justify-center">
                                <button
                                  onClick={() => {
                                    setEditingStaff(staff);
                                    setShowStaffModal(true);
                                  }}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="編輯人員"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deleteStaff(staff.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="刪除人員"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
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
                  編輯排班 - {editingCell.staff.name}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  日期: {editingCell.date}
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      班別
                    </label>
                    <select
                      id="cellShiftType"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none"
                      defaultValue={editingCell.shift?.shiftType || "上班"}
                    >
                      {SHIFT_TYPES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      地點
                    </label>
                    <select
                      id="cellShiftLocation"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none"
                      defaultValue={editingCell.shift?.location || "北投"}
                    >
                      {LOCATIONS.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-between mt-6">
                  {editingCell.shift ? (
                    <button
                      onClick={() => {
                        setShifts((prev) =>
                          prev.filter((s) => s.id !== editingCell.shift!.id),
                        );
                        setIsDirty(true);
                        setEditingCell(null);
                      }}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
                    >
                      清除
                    </button>
                  ) : (
                    <div></div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingCell(null)}
                      className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        const type = (
                          document.getElementById(
                            "cellShiftType",
                          ) as HTMLSelectElement
                        ).value;
                        const loc = (
                          document.getElementById(
                            "cellShiftLocation",
                          ) as HTMLSelectElement
                        ).value;

                        if (editingCell.shift) {
                          setShifts((prev) =>
                            prev.map((s) =>
                              s.id === editingCell.shift!.id
                                ? {
                                    ...s,
                                    shiftType: type as any,
                                    location: loc as any,
                                  }
                                : s,
                            ),
                          );
                        } else {
                          setShifts((prev) => [
                            ...prev,
                            {
                              id: generateUUID(),
                              staffId: editingCell.staff.id,
                              date: editingCell.date,
                              shiftType: type as any,
                              location: loc as any,
                            },
                          ]);
                        }
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

          {/* 人員管理模態框 */}
          {showStaffModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold mb-4">
                  {editingStaff ? "編輯人員" : "新增人員"}
                </h3>
                <StaffForm
                  staff={editingStaff}
                  onSave={saveStaff}
                  onCancel={() => {
                    setShowStaffModal(false);
                    setEditingStaff(null);
                  }}
                />
              </div>
            </div>
          )}

          {/* 確認模態框 */}
          <ConfirmModal
            isOpen={showConfirmModal}
            title="確認刪除"
            message="確定要刪除這個人員嗎？此操作會將人員標記為非活躍狀態。"
            onConfirm={confirmAction}
            onCancel={() => setShowConfirmModal(false)}
          />
        </div>
      </div>
    </div>
  );
};

// 人員表單組件
const StaffForm: React.FC<{
  staff: AdministrativeStaff | null;
  onSave: (staff: AdministrativeStaff) => void;
  onCancel: () => void;
}> = ({ staff, onSave, onCancel }) => {
  const [formData, setFormData] = useState<AdministrativeStaff>(
    staff || {
      id: generateUUID(),
      name: "",
      category: AdministrativeCategory.ADMIN,
      isActive: true,
      displayOrder: 0,
    },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          姓名
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          分類
        </label>
        <select
          value={formData.category}
          onChange={(e) =>
            setFormData({
              ...formData,
              category: e.target.value as AdministrativeCategory,
            })
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.values(AdministrativeCategory).map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          電話
        </label>
        <input
          type="tel"
          value={formData.phone || ""}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <input
          type="checkbox"
          id="isActive"
          checked={formData.isActive}
          onChange={(e) =>
            setFormData({ ...formData, isActive: e.target.checked })
          }
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
        />
        <label
          htmlFor="isActive"
          className="text-sm font-medium text-gray-700 cursor-pointer"
        >
          在職中 (Active)
        </label>
      </div>

      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          儲存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
        >
          取消
        </button>
      </div>
    </form>
  );
};

export default AdministrativeSchedulePage;
