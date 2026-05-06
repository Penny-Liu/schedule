import React, { useState, useMemo, useEffect } from "react";
import { User, StationDefault } from "../types";
import { db } from "../services/store";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Edit3,
  Save,
  X,
  UploadCloud,
  RefreshCw,
} from "lucide-react";
import ExcelJS from "exceljs";
import { isUserOnEmploymentPause } from "../services/utils";

interface RadiographerWorkloadPageProps {
  currentUser: User;
}

const RadiographerWorkloadPage: React.FC<RadiographerWorkloadPageProps> = ({
  currentUser,
}) => {
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  });

  const [radiographers, setRadiographers] = useState<User[]>([]);
  const cycles = db.getCycles();
  const shifts = db.getShifts("", "");
  const cloudSchedule = db.getCloudScheduleEntries();
  const doctorShifts = db.doctorShifts;
  const workloads = db.workloads;

  const [isEditing, setIsEditing] = useState(false);
  const [editingData, setEditingData] = useState<Record<string, any>>({});
  const [importTarget, setImportTarget] = useState<
    "reportTyping" | "cta" | "proofreader"
  >("reportTyping");
  const [isSaving, setIsSaving] = useState(false);

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

    // 根據 currentMonth 找出真正的「排班週期」範圍，而不是死板的整個月
    const cycleName1 = `${year}/${String(month).padStart(2, "0")}`;
    const cycleName2 = `${year}/${month}`;
    const targetCycle = cycles.find(
      (c) => c.name === cycleName1 || c.name === cycleName2,
    );

    let firstDay = `${currentMonth}-01`;
    let lastDay = `${currentMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

    if (targetCycle) {
      firstDay = targetCycle.startDate;
      lastDay = targetCycle.endDate;
    }

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
      reportDates: buildDateRange(reportStart, reportEnd),
    };
  }, [currentMonth, cycles]);

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
        db
          .getUsers()
          .filter(
            (u) =>
              u.isRadiographer === true &&
              u.isActive !== false &&
              !u.isPartTime &&
              (!generalDates.some((date) => isUserOnEmploymentPause(u, date)) ||
                hasWorkedInRange(u, generalDates)),
          ),
      );
    };
    refreshData();
    return db.subscribe(refreshData);
  }, [generalDates, shifts]);

  const workloadData = useMemo(() => {
    return radiographers.map((user) => {
      const [year, month] = currentMonth.split("-").map(Number);
      const stats: any = {
        id: undefined,
        year,
        month,
        date: currentMonth,
        radiographerName: user.name,
        name: user.name,
        mr: 0,
        us: 0,
        ct: 0,
        dx: 0,
        mg: 0,
        bmd: 0,
        cta: 0,
        reportTyping: 0,
        proofreader: 0,
      };

      const userWorkloads = workloads.filter(
        (w) => w.radiographerName === user.name && w.date === currentMonth,
      );

      if (userWorkloads.length > 0) {
        stats.id = userWorkloads[0].id;
        userWorkloads.forEach((w) => {
          stats.mr += w.mr || 0;
          stats.us += w.us || 0;
          stats.ct += w.ct || 0;
          stats.dx += w.dx || 0;
          stats.mg += w.mg || 0;
          stats.bmd += w.bmd || 0;
          // 使用與 Supabase 資料庫對齊的正式欄位名稱
          stats.cta += w.ctaPostProcessing || w.cta || 0;
          stats.reportTyping += w.reportEntry || w.reportTyping || 0;
          stats.proofreader += w.imageProofing || w.proofreader || 0;
        });
      }
      return stats;
    });
  }, [radiographers, workloads, currentMonth]);

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

  const handleInputChange = (
    userName: string,
    field: string,
    value: string,
  ) => {
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
        db.updateWorkload(row),
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

  const handleImportExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      let rows: any[][] = [];

      // 嘗試解析為字串，檢查是否為 Salesforce 的 HTML 偽裝 Excel
      const decoder = new TextDecoder("utf-8");
      const text = decoder.decode(new Uint8Array(buffer));
      if (text.includes("<html") || text.includes("<table")) {
        // Salesforce 的 .xls 實際上是 HTML，包含多個 table
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/html");
        const trs = doc.querySelectorAll("tr");
        rows = Array.from(trs).map((tr) =>
          Array.from(tr.querySelectorAll("td, th")).map(
            (td) => td.textContent?.trim() || "",
          ),
        );
      } else {
        // 真實的 Excel 檔案 (用 exceljs)
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];
        worksheet.eachRow((row) => {
          rows.push(row.values.slice(1)); // exceljs row.values[0] 是 undefined
        });
      }

      // 無論是否已在編輯狀態，都以畫面上最新的資料作為基底
      const newData: Record<string, any> = {};
      workloadData.forEach((d) => {
        newData[d.radiographerName] = { ...d };
      });

      let matchCount = 0;

      // 取得目前系統上的所有放射師姓名
      const radiographerNames = Object.keys(newData);

      rows.forEach((row) => {
        if (!row || row.length === 0) return;

        // 在這一直行中尋找是否有儲存格等於放射師的姓名
        const nameIndex = row.findIndex(
          (cell) => cell && radiographerNames.includes(String(cell).trim()),
        );

        if (nameIndex !== -1) {
          const name = String(row[nameIndex]).trim();

          // 總計數量通常在該列的最後面，我們從最後面倒著找第一個數字
          let count = 0;
          for (let i = row.length - 1; i > nameIndex; i--) {
            // 移除可能存在的千分位逗號
            const valStr = String(row[i] || "").replace(/,/g, "");
            const parsed = parseInt(valStr, 10);
            if (!isNaN(parsed)) {
              count = parsed;
              break;
            }
          }

          if (newData[name]) {
            newData[name][importTarget] = count;
            matchCount++;
          }
        }
      });

      if (matchCount === 0) {
        const sampleCells = Array.from(
          new Set(
            rows
              .flat()
              .filter((c) => typeof c === "string" && c.trim().length > 1),
          ),
        ).slice(0, 10);
        alert(
          `警告：在檔案中找不到任何與系統相符的放射師姓名。\n\n系統預期的名字：${radiographerNames.slice(0, 5).join(", ")}...\n\n檔案中讀取到的內容：\n${sampleCells.join(", ")}\n\n(如果讀取到的內容是亂碼，表示這份 Excel 是 HTML 偽裝的，請在 Salesforce 改選「CSV」格式匯出)`,
        );
        return;
      }

      const targetNames = {
        reportTyping: "報告登打",
        cta: "CTA後處理",
        proofreader: "影像校對",
      };

      setEditingData(newData);
      setIsEditing(true); // 自動開啟編輯模式讓使用者可以馬上儲存
      alert(
        `✅ 成功匯入 Excel！已對齊 ${matchCount} 位放射師的「${targetNames[importTarget]}」量。請確認數據後按儲存。`,
      );
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
  };

  const handleExport = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("工作量統計");

      // 欄位標題
      const headers = [
        "姓名",
        "上班天數",
        "現場天數",
        "遠班",
        "北投天數",
        "大直天數",
        "休假",
        "備註",
        "場控",
        "輔班",
        "BMD/DX",
        "CT",
        "MR",
        "US",
        "技術支援",
        "CTA後處理",
        "影像校正",
        "報告登打",
        "可以擔任的崗位職",
        "工作加點",
        "工作減點",
        "本月特殊任務",
        "配合度",
        "其它",
      ];
      worksheet.addRow(headers);

      // 資料列
      workloadData.forEach((row) => {
        worksheet.addRow([
          row.name,
          row.workDays || 0,
          row.onSiteDays || 0,
          row.remoteDays || 0,
          row.beitouDays || 0,
          row.dazhiDays || 0,
          row.offDays || 0,
          row.remarks || "",
          row.floorControl || 0,
          row.assist || 0,
          row.bmd || 0,
          row.ct || 0,
          row.mr || 0,
          row.us || 0,
          row.techSupport || 0,
          row.cta || 0,
          row.proofreader || 0,
          row.reportTyping || 0,
          row.positions || "",
          row.addPoints || 0,
          row.minusPoints || 0,
          row.specialTasks || "",
          row.cooperation || 0,
          row.other || "",
        ]);
      });

      // 設定欄寬
      worksheet.columns = [
        { width: 10 }, // 姓名
        { width: 8 },
        { width: 8 },
        { width: 10 },
        { width: 8 },
        { width: 8 },
        { width: 5 },
        { width: 15 }, // 天數與備註
        { width: 12 },
        { width: 12 },
        { width: 10 },
        { width: 6 },
        { width: 6 },
        { width: 6 },
        { width: 10 }, // 崗位
        { width: 12 },
        { width: 12 },
        { width: 12 }, // 後處理等
        { width: 25 },
        { width: 8 },
        { width: 8 },
        { width: 15 },
        { width: 8 },
        { width: 15 }, // 備註與其它
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `放射師工作量統計_${currentMonth}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("Excel export failed", e);
      alert(`匯出 Excel 失敗: ${e.message}`);
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
              <h2 className="text-xl font-bold text-slate-800">
                放射師工作量統計
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                一般區間：{generalDates[0]} ~{" "}
                {generalDates[generalDates.length - 1]} | 報告區間：
                {reportDates[0]} ~ {reportDates[reportDates.length - 1]}
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
                  className={`flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm ${isSaving ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <Save size={16} /> {isSaving ? "儲存中..." : "儲存變更"}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 bg-white border border-slate-200 pl-2 rounded-lg shadow-sm overflow-hidden">
                  <span className="text-sm text-slate-500 font-medium">
                    匯入目標：
                  </span>
                  <select
                    value={importTarget}
                    onChange={(e) => setImportTarget(e.target.value as any)}
                    className="text-sm text-slate-700 bg-transparent py-1.5 outline-none font-bold"
                  >
                    <option value="reportTyping">報告登打</option>
                    <option value="cta">CTA後處理</option>
                    <option value="proofreader">影像校對</option>
                  </select>
                  <label className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border-l border-slate-200 text-slate-700 px-3 py-1.5 text-sm font-bold transition-colors cursor-pointer">
                    <UploadCloud size={16} /> 匯入 xls/csv
                    <input
                      type="file"
                      accept=".xls,.xlsx,.csv"
                      className="hidden"
                      onChange={handleImportExcel}
                    />
                  </label>
                </div>
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
                  <th className="px-4 py-3 text-center text-teal-600 bg-teal-50/50">
                    CTA後處理
                  </th>
                  <th className="px-4 py-3 text-center text-indigo-600 bg-indigo-50/50">
                    報告登打
                  </th>
                  <th className="px-4 py-3 text-center text-purple-600 bg-purple-50/50">
                    影像校對
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workloadData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-8 text-center text-slate-400 font-medium"
                    >
                      無資料
                    </td>
                  </tr>
                ) : (
                  (isEditing ? Object.values(editingData) : workloadData).map(
                    (row: any, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-bold text-slate-800 sticky left-0 bg-white border-r border-slate-100">
                          {row.name}
                        </td>
                        {[
                          "mr",
                          "us",
                          "ct",
                          "dx",
                          "mg",
                          "bmd",
                          "cta",
                          "reportTyping",
                          "proofreader",
                        ].map((field) => (
                          <td
                            key={field}
                            className={`px-4 py-2.5 text-center font-medium ${field === "cta" ? "bg-teal-50/10 text-teal-600 font-bold" : field === "reportTyping" ? "bg-indigo-50/10 text-indigo-600 font-bold" : field === "proofreader" ? "bg-purple-50/10 text-purple-600 font-bold" : "text-slate-700"}`}
                          >
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                value={row[field]}
                                onChange={(e) =>
                                  handleInputChange(
                                    row.name,
                                    field,
                                    e.target.value,
                                  )
                                }
                                className="w-16 text-center border border-emerald-200 rounded px-1 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-emerald-50/50"
                              />
                            ) : (
                              row[field] || "-"
                            )}
                          </td>
                        ))}
                      </tr>
                    ),
                  )
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
