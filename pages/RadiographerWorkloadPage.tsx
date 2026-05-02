import React, { useState, useMemo, useEffect } from "react";
import { User, StationDefault } from "../types";
import { db } from "../services/store";
import { BarChart3, Download, FileSpreadsheet, Edit3, Save, X } from "lucide-react";
import { utils, writeFile } from "xlsx";
import { isUserOnEmploymentPause } from "../services/utils";

interface RadiographerWorkloadPageProps {
  currentUser: User;
}

const RadiographerWorkloadPage: React.FC<RadiographerWorkloadPageProps> = ({ currentUser }) => {
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  });

  const [radiographers, setRadiographers] = useState<User[]>([]);
  const cycles = db.getCycles();
  const shifts = db.getShifts("", "");
  const cloudSchedule = db.getCloudScheduleEntries();
  const doctorShifts = db.doctorShifts;
  const workloads = db.workloads; // 新增：從資料庫讀取獨立的工作量表單

  const [isEditing, setIsEditing] = useState(false);
  const [editingData, setEditingData] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);

  // ── Helper: build date array for a range ──
  const buildDateRange = (startDate: string, endDate: string) => {
    const dates: string[] = [];
    const [sY, sM, sD] = startDate.split("-").map(Number);
    const [eY, eM, eD] = endDate.split("-").map(Number);
    const start = new Date(sY, sM - 1, sD);
    const end = new Date(eY, eM - 1, eD);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(
        d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(d.getDate()).padStart(2, "0"),
      );
    }
    return dates;
  };

  const { generalDates, reportDates } = useMemo(() => {
    const [year, month] = currentMonth.split("-").map(Number);
    
    // 一般區間：該月 1 日到月底
    const firstDay = `${currentMonth}-01`;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const lastDay = `${currentMonth}-${String(lastDayOfMonth).padStart(2, "0")}`;

    // 報告區間：上個月 26 日到這個月 25 日
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear--;
    }
    const reportStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-26`;
    const reportEnd = `${year}-${String(month).padStart(2, "0")}-25`;

    return {
      generalDates: buildDateRange(firstDay, lastDay),
      reportDates: buildDateRange(reportStart, reportEnd)
    };
  }, [currentMonth]);

  const hasWorkedInRange = (user: User, range: string[]) => {
    return shifts.some(
      (s) =>
        s.userId === user.id &&
        range.includes(s.date) &&
        s.station !== StationDefault.UNASSIGNED &&
        s.station !== StationDefault.OFF &&
        s.station !== "休假",
    );
  };

  useEffect(() => {
    const refreshData = () => {
      setRadiographers(
        db.getUsers().filter(
          (u) =>
            u.isRadiographer === true &&
            u.isActive !== false &&
            !u.isPartTime &&
            (!generalDates.some((date) => isUserOnEmploymentPause(u, date)) ||
              hasWorkedInRange(u, generalDates))
        )
      );
    };
    refreshData();
    return db.subscribe(refreshData);
  }, [generalDates, shifts]);

  // ── Calculations ──
  const workloadData = useMemo(() => {
    return radiographers.map((user) => {
      const [year, month] = currentMonth.split("-").map(Number);
      const stats: any = {
        id: undefined,
        year,
        month,
        radiographerName: user.name,
        name: user.name,
        mr: 0,
        us: 0,
        ct: 0,
        dx: 0,
        mg: 0,
        bmd: 0,
        cta: 0, // CTA後處理
        reportTyping: 0, // 報告登打
        proofreader: 0, // 影像校對
      };

      // 優先檢查是否有 Salesforce 同步進來的獨立表單資料 (radiographer_workload)
      // 資料庫儲存了 year, month，已經被轉成 date (YYYY-MM)
      const userWorkloads = workloads.filter(
        (w) => w.radiographerName === user.name && w.date === currentMonth
      );

      if (userWorkloads.length > 0) {
        stats.id = userWorkloads[0].id; // 記錄 ID 以便更新
        // 如果有同步的資料，就以同步資料加總為主，避免被手動排班弄亂
        userWorkloads.forEach((w) => {
          stats.mr += w.mr || 0;
          stats.us += w.us || 0;
          stats.ct += w.ct || 0;
          stats.dx += w.dx || 0;
          stats.mg += w.mg || 0;
          stats.bmd += w.bmd || 0;
          stats.cta += w.cta || 0;
          stats.reportTyping += w.reportTyping || 0;
          stats.proofreader += w.proofreader || 0;
        });
      } else {
        // 沒有同步資料時的 Fallback：由前端班表自動計算
        generalDates.forEach((dateStr) => {
          const manualShift = shifts.find(
            (s) => s.userId === user.id && s.date === dateStr,
          );
          if (manualShift) {
            const station = manualShift.station.toUpperCase();
            if (station.includes("MR")) stats.mr++;
            if (station.includes("US") || station.includes("超音波")) stats.us++;
            if (station.includes("CT")) stats.ct++;
            if (station.includes("DX")) stats.dx++;
            if (station.includes("MG") || station.includes("乳攝")) stats.mg++;
            if (station.includes("BMD")) stats.bmd++;
          }
        });

        // 報告區間 (報告登打, 影像校對) - Fallback
        reportDates.forEach((dateStr) => {
          const cloudShifts = cloudSchedule.filter((cs) => cs.date === dateStr);
          
          cloudShifts.forEach((cs) => {
            if (cs.proofreaderUserId === user.id) {
               const dShift = doctorShifts.find((s) => s.date === dateStr && s.doctorId === cs.doctorId);
               if (dShift) {
                 const station = (dShift.scheduled_station || dShift.station || "").toLowerCase();
                 const location = (dShift.location || "").toLowerCase();
                 if (!station.includes("禁排") && !station.includes("off") && !location.includes("大直") && !location.includes("台中") && !station.includes("大直") && !station.includes("台中")) {
                    const isRemote = station.includes("遠") || station.includes("remote");
                    const isImagingOrSupport = station.includes("影像") || station.includes("支援");
                    if (isRemote || isImagingOrSupport) {
                       stats.proofreader++;
                    }
                 }
               }
            }
            if (cs.assistantIds && cs.assistantIds.includes(user.id)) {
              stats.reportTyping++;
            }
          });
        });
      }

      return stats;
    });
  }, [radiographers, generalDates, reportDates, shifts, cloudSchedule, doctorShifts, workloads, currentMonth]);

  // ── 編輯功能 ──
  const handleToggleEdit = () => {
    if (!isEditing) {
      const initData: Record<string, any> = {};
      workloadData.forEach((row) => {
        initData[row.name] = { ...row };
      });
      setEditingData(initData);
    }
    setIsEditing(!isEditing);
  };

  const handleInputChange = (userName: string, field: string, value: string) => {
    setEditingData((prev) => ({
      ...prev,
      [userName]: {
        ...prev[userName],
        [field]: parseInt(value) || 0,
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const promises = Object.values(editingData).map((row) => 
        db.updateWorkload(row)
      );
      await Promise.all(promises);
      setIsEditing(false);
      alert("儲存成功！");
    } catch (e) {
      console.error("Save failed", e);
      alert("儲存失敗，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Export Excel ──
  const handleExport = () => {
    try {
      const excelData = workloadData.map((row) => ({
        "放射師姓名": row.name,
        "MR": row.mr,
        "US": row.us,
        "CT": row.ct,
        "DX": row.dx,
        "MG": row.mg,
        "BMD": row.bmd,
        "CTA後處理": row.cta,
        "報告登打": row.reportTyping,
        "影像校對": row.proofreader,
      }));

      const ws = utils.json_to_sheet(excelData);
      const wscols = [
        { wch: 15 }, // 姓名
        { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }
      ];
      ws["!cols"] = wscols;

      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "工作量統計");
      const fileName = `工作量統計_${currentMonth}.xlsx`;
      writeFile(wb, fileName);
    } catch (e) {
      console.error("Excel export failed", e);
      alert("匯出 Excel 失敗，請稍後再試");
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative z-20">
      <div className="flex-none px-6 py-4 bg-white border-b border-slate-200 shadow-sm">
         <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <BarChart3 size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">放射師工作量統計</h2>
                <p className="text-xs text-slate-500 font-medium">
                  一般區間：{generalDates[0]} ~ {generalDates[generalDates.length - 1]} | 報告區間：{reportDates[0]} ~ {reportDates[reportDates.length - 1]}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="month"
                value={currentMonth}
                onChange={(e) => setCurrentMonth(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700"
              />
              
              {isEditing ? (
                <>
                  <button
                    onClick={handleToggleEdit}
                    className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
                  >
                    <X size={16} /> 取消
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Save size={16} /> {isSaving ? "儲存中..." : "儲存變更"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleToggleEdit}
                    className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm"
                  >
                    <Edit3 size={16} /> 編輯數據
                  </button>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm shadow-teal-200"
                  >
                    <FileSpreadsheet size={16} /> 匯出 Excel
                  </button>
                </>
              )}
            </div>
         </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                    放射師姓名
                  </th>
                  <th className="px-4 py-3 text-center">MR</th>
                  <th className="px-4 py-3 text-center">US</th>
                  <th className="px-4 py-3 text-center">CT</th>
                  <th className="px-4 py-3 text-center">DX</th>
                  <th className="px-4 py-3 text-center">MG</th>
                  <th className="px-4 py-3 text-center">BMD</th>
                  <th className="px-4 py-3 text-center text-teal-600 bg-teal-50/50">CTA後處理</th>
                  <th className="px-4 py-3 text-center text-indigo-600 bg-indigo-50/50">報告登打</th>
                  <th className="px-4 py-3 text-center text-purple-600 bg-purple-50/50">影像校對</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workloadData.length === 0 ? (
                  <tr>
                     <td colSpan={10} className="px-4 py-8 text-center text-slate-400 font-medium">無資料</td>
                  </tr>
                ) : (
                  (isEditing ? Object.values(editingData) : workloadData).map((row: any, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2.5 font-bold text-slate-800 sticky left-0 bg-white border-r border-slate-100">
                        {row.name}
                      </td>
                      {['mr', 'us', 'ct', 'dx', 'mg', 'bmd', 'cta', 'reportTyping', 'proofreader'].map((field) => (
                        <td key={field} className={`px-4 py-2.5 text-center font-medium ${field === 'cta' ? 'bg-teal-50/10 text-teal-600 font-bold' : field === 'reportTyping' ? 'bg-indigo-50/10 text-indigo-600 font-bold' : field === 'proofreader' ? 'bg-purple-50/10 text-purple-600 font-bold' : 'text-slate-700'}`}>
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              value={row[field]}
                              onChange={(e) => handleInputChange(row.name, field, e.target.value)}
                              className="w-16 text-center border border-emerald-200 rounded px-1 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-emerald-50/50"
                            />
                          ) : (
                            row[field] || "-"
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RadiographerWorkloadPage;
