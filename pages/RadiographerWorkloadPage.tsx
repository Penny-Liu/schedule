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
import { utils, writeFile, read } from "xlsx";
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
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const data = new Uint8Array(buffer);

      // 嘗試解析為字串，檢查是否為 Salesforce 的 HTML 偽裝 Excel
      const decoder = new TextDecoder("utf-8");
      const text = decoder.decode(data);

      let rows: any[][] = [];

      if (text.includes("<html") || text.includes("<table")) {
        // Salesforce 的 .xls 實際上是 HTML，包含多個 table，xlsx 套件只會抓第一個(導致抓不到資料)
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/html");
        const trs = doc.querySelectorAll("tr");
        rows = Array.from(trs).map((tr) =>
          Array.from(tr.querySelectorAll("td, th")).map(
            (td) => td.textContent?.trim() || "",
          ),
        );
      } else {
        // 真實的 Excel 檔案
        const workbook = read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        rows = utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
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
      const ws = workbook.addWorksheet("工作量統計");

      // 定義邊框與對齊樣式
      const borderStyle: any = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      const alignCenter = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      } as any;

      const [year, month] = currentMonth.split("-");

      // 取出本月全域排班週期的頭尾日期
      const startD = generalDates[0].split("-");
      const endD = generalDates[generalDates.length - 1].split("-");
      const cycleNum = parseInt(month, 10);
      const cycleNames = [
        "零",
        "一",
        "二",
        "三",
        "四",
        "五",
        "六",
        "七",
        "八",
        "九",
        "十",
        "十一",
        "十二",
      ];
      const cycleChinese = cycleNames[cycleNum] || cycleNum;
      const cycleLabel = `第${cycleChinese}週期 (${parseInt(startD[1])}/${parseInt(startD[2])}-${parseInt(endD[1])}/${parseInt(endD[2])})`;

      // 第 1 列：標題
      const titleRow = ws.addRow([cycleLabel]);
      titleRow.font = { bold: true, size: 14 };
      titleRow.alignment = alignCenter;
      ws.mergeCells(1, 1, 1, 30);
      titleRow.height = 30;

      // 第 2 列：大分類標題
      const groupHeaderRow = ws.addRow(Array(30).fill(""));
      groupHeaderRow.getCell(9).value = "實打實放射師統計(天)";
      groupHeaderRow.getCell(16).value = "檢查量(醫令)";
      groupHeaderRow.getCell(25).value = "備註";
      ws.mergeCells(2, 9, 2, 15);
      ws.mergeCells(2, 16, 2, 24);
      ws.mergeCells(2, 25, 2, 30);
      groupHeaderRow.font = { bold: true };
      groupHeaderRow.alignment = alignCenter;
      for (let i = 1; i <= 30; i++) {
        groupHeaderRow.getCell(i).border = borderStyle;
        groupHeaderRow.getCell(i).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3F4F6" },
        };
      }

      // 第 3 列：詳細欄位標題
      const headers = [
        "姓名",
        "上班天數",
        "現場天數",
        "智醫天數",
        "北投天數",
        "大直天數",
        "休",
        "備註",
        "顧客價值(主)",
        "顧客價值(輔)",
        "崗BMD/DX",
        "崗CT",
        "MR",
        "US",
        "技術支援",
        "MR",
        "US",
        "CT",
        "DX",
        "MG",
        "BMD",
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
      const headerRow = ws.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.alignment = alignCenter;
      for (let i = 1; i <= 30; i++) {
        headerRow.getCell(i).border = borderStyle;
        headerRow.getCell(i).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3F4F6" },
        };
      }

      // 第 4 列開始：資料
      workloadData.forEach((row) => {
        const user = radiographers.find((u) => u.name === row.name);

        // 計算排班天數與崗位次數
        let workDays = 0,
          onSiteDays = 0,
          remoteDays = 0,
          beitouDays = 0,
          dazhiDays = 0,
          offDays = 0;
        let s_control = 0,
          s_assist = 0,
          s_bmddx = 0,
          s_ct = 0,
          s_mr = 0,
          s_us = 0,
          s_tech = 0;
        let remark = "";

        if (user) {
          let userDates = generalDates;

          // 檢查是否有個人週期設定
          if (user.personalCycles?.[currentMonth]) {
            const pCycle = user.personalCycles[currentMonth];
            userDates = buildDateRange(pCycle.startDate, pCycle.endDate);
            const pStart = pCycle.startDate.substring(5).replace("-", "/");
            const pEnd = pCycle.endDate.substring(5).replace("-", "/");
            remark = `${pStart}~${pEnd} ${pCycle.memo || ""}`.trim();
          }

          userDates.forEach((dateStr) => {
            const status = db.getUserStatusOnDate(user.id, dateStr);
            if (status === "OFF") {
              offDays++;
              return;
            }

            let station = "";
            let roles: string[] = [];
            const manualShift = shifts.find(
              (s) => s.userId === user.id && s.date === dateStr,
            );
            if (manualShift) {
              station = manualShift.station || "";
              roles = manualShift.specialRoles || [];
            }

            workDays++;
            if (station.includes("遠")) remoteDays++;
            else if (station.includes("大直")) dazhiDays++;
            else beitouDays++;

            if (station.includes("場控") || station.includes("主控"))
              s_control++;
            if (
              roles.includes("輔班") ||
              station.includes("輔班") ||
              roles.includes("輔控") ||
              station.includes("輔控")
            )
              s_assist++;
            if (
              station.includes("BMD") ||
              station.includes("DX") ||
              roles.includes("兼BMD/DX")
            )
              s_bmddx++;
            if (station.includes("CT")) s_ct++;
            if (station.includes("MR")) s_mr++;
            if (station.includes("US")) s_us++;
            if (station.includes("技術支援")) s_tech++;
          });
          onSiteDays = workDays - remoteDays;
        }

        const capabilitiesText = user?.capabilities
          ? user.capabilities.join("、")
          : "";

        const dataRow = ws.addRow([
          row.name,
          workDays,
          onSiteDays,
          remoteDays,
          beitouDays,
          dazhiDays,
          offDays,
          remark,
          s_control,
          s_assist,
          s_bmddx,
          s_ct,
          s_mr,
          s_us,
          s_tech,
          row.mr,
          row.us,
          row.ct,
          row.dx,
          row.mg,
          row.bmd,
          row.cta,
          row.proofreader,
          row.reportTyping,
          capabilitiesText,
          "",
          "",
          "",
          "",
          "",
        ]);

        dataRow.alignment = alignCenter;
        for (let i = 1; i <= 30; i++) {
          dataRow.getCell(i).border = borderStyle;
        }
      });

      // 設定欄寬
      ws.columns = [
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
        { width: 6 },
        { width: 6 },
        { width: 6 },
        { width: 6 },
        { width: 6 },
        { width: 6 }, // 檢查量
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
    } catch (error: any) {
      console.error("Export error:", error);
      alert(`匯出失敗: ${error.message}`);
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
