import React, { useState, useMemo, useEffect } from "react";
import {
  User,
  UserRole,
  SPECIAL_ROLES,
  StationDefault,
  DateEventType,
  PERMISSIONS,
} from "../types";
import { db } from "../services/store";
import {
  BarChart3,
  Calendar,
  Filter,
  Download,
  FileSpreadsheet,
  Settings2,
  Save,
  FileText,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Activity,
  RefreshCw,
  X,
  TrendingUp,
} from "lucide-react";
import ExcelJS from "exceljs";
import { getEmploymentPause, isUserOnEmploymentPause } from "../services/utils";
import RadiographerWorkloadPage from "../pages/RadiographerWorkloadPage";
import PhysicianWorkloadAnalysis from "../components/dashboard/PhysicianWorkloadAnalysis";

interface StatisticsPageProps {
  currentUser: User;
}

const StatisticsPage: React.FC<StatisticsPageProps> = ({ currentUser }) => {
  const cycles = db.getCycles();
  const [activeTab, setActiveTab] = useState<
    "stats" | "cycles" | "workload" | "physician"
  >("stats");

  // ── Helper: build date array for a range (Robust to timezone) ──
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

  // ── Format date range for remarks (e.g. "3/8-4/6") ──
  const formatRangeShort = (startDate: string, endDate: string) => {
    const [, sm, sd] = startDate.split("-");
    const [, em, ed] = endDate.split("-");
    return `${parseInt(sm)}/${parseInt(sd)}-${parseInt(em)}/${parseInt(ed)}`;
  };

  // ── Personal Cycle helpers ──
  const calculateDays = (startDate?: string, endDate?: string) => {
    if (!startDate || !endDate) return 0;
    const [sY, sM, sD] = startDate.split("-").map(Number);
    const [eY, eM, eD] = endDate.split("-").map(Number);
    const start = new Date(sY, sM - 1, sD);
    const end = new Date(eY, eM - 1, eD);
    const diffDays =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 0;
  };

  // ── Default dates for a month: prefer roster cycle that starts (or overlaps) this month ──
  const getDefaultDatesForMonth = (yearMonth: string) => {
    const [year, month] = yearMonth.split("-").map(Number);
    const monthStart = `${yearMonth}-01`;
    const lastDay = new Date(year, month, 0);
    const monthEnd = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

    // Prefer cycle that starts this month; fallback to one that overlaps
    const startsThis = cycles.find((c) => c.startDate.startsWith(yearMonth));
    if (startsThis)
      return { startDate: startsThis.startDate, endDate: startsThis.endDate };

    const overlapping = cycles.find(
      (c) => c.startDate <= monthEnd && c.endDate >= monthStart,
    );
    if (overlapping)
      return { startDate: overlapping.startDate, endDate: overlapping.endDate };

    // Final fallback: calendar month
    return { startDate: monthStart, endDate: monthEnd };
  };

  // Default to the current cycle (based on today) if found, otherwise first cycle (latest), otherwise 'rolling'
  const [selectedCycleId, setSelectedCycleId] = useState<string>(() => {
    const today = new Date().toISOString().split("T")[0];
    const activeCycle = cycles.find(
      (c) => today >= c.startDate && today <= c.endDate,
    );
    if (activeCycle) return activeCycle.id;
    return cycles.length > 0 ? cycles[0].id : "rolling";
  });
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    db.loadDataForMonth(currentDate.getFullYear(), currentDate.getMonth() + 1);
  }, [currentDate]);

  // Personal Cycle Tab state
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  });
  const [radiographers, setRadiographers] = useState<User[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncTasks, setSyncTasks] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const mo = today.getMonth() + 1;
    const todayStr = `${y}-${String(mo).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const end1 = new Date(today);
    end1.setDate(today.getDate() + 30);
    const defaultEnd1 = `${end1.getFullYear()}-${String(end1.getMonth() + 1).padStart(2, "0")}-${String(end1.getDate()).padStart(2, "0")}`;
    const firstDay2 = `${y}-${String(mo).padStart(2, "0")}-01`;
    const lastDay2 = new Date(y, mo, 0).toISOString().split("T")[0];
    let prevY = y,
      prevMo = mo - 1;
    if (prevMo === 0) {
      prevMo = 12;
      prevY--;
    }
    const rs2 = `${prevY}-${String(prevMo).padStart(2, "0")}-26`;
    const re2 = `${y}-${String(mo).padStart(2, "0")}-25`;
    const end3 = new Date(today);
    end3.setDate(today.getDate() + 5);
    const defaultEnd3 = `${end3.getFullYear()}-${String(end3.getMonth() + 1).padStart(2, "0")}-${String(end3.getDate()).padStart(2, "0")}`;

    return [
      {
        id: 1,
        name: "每日統計 (醫令數與客戶量)",
        selected: true,
        start: todayStr,
        end: defaultEnd1,
      },
      {
        id: 2,
        name: "各站檢查量與影像報告",
        selected: false,
        start: firstDay2,
        end: lastDay2,
        reportStart: rs2,
        reportEnd: re2,
      },
      {
        id: 3,
        name: "影像醫師工作量分類",
        selected: true,
        start: todayStr,
        end: defaultEnd3,
      },
    ];
  });

  // ── Default dates for a month (already moved up) ──

  const cycleMonthKey = useMemo(() => {
    if (selectedCycleId === "rolling") {
      return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
    }
    const cycle = cycles.find((c) => c.id === selectedCycleId);
    if (!cycle) return null;

    // If name is like '2026/02', use that as the month key ('2026-02') to match personalCycles
    if (cycle.name.match(/^\d{4}\/\d{2}$/)) {
      return cycle.name.replace("/", "-");
    }

    return cycle.startDate.slice(0, 7);
  }, [selectedCycleId, currentDate, cycles]);

  // ── Determine Date Range (for header display / default) ──
  const dateRange = useMemo(() => {
    if (selectedCycleId !== "rolling") {
      const cycle = cycles.find((c) => c.id === selectedCycleId);
      if (cycle) {
        return buildDateRange(cycle.startDate, cycle.endDate);
      }
    }
    const start = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
    );
    const end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
    return buildDateRange(start, end);
  }, [currentDate, selectedCycleId, cycles]);

  const selectedMonthDateRange = useMemo(() => {
    const defaults = getDefaultDatesForMonth(selectedMonth);
    return buildDateRange(defaults.startDate, defaults.endDate);
  }, [selectedMonth, cycles]);

  const shifts = db.getShifts("", "");
  const cloudSchedule = db.getCloudScheduleEntries();
  const doctorShifts = db.doctorShifts;

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

  // Sync radiographers with DB and handle updates
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
              (!selectedMonthDateRange.some((date) =>
                isUserOnEmploymentPause(u, date),
              ) ||
                hasWorkedInRange(u, selectedMonthDateRange)),
          ),
      );
    };
    refreshData();
    return db.subscribe(refreshData);
  }, [selectedMonthDateRange]);

  // 只統計全職、在職且不在留停區間的放射師
  const users = useMemo(() => {
    return db
      .getUsers()
      .filter(
        (u) =>
          u.isRadiographer === true &&
          u.isActive !== false &&
          !u.isPartTime &&
          (!dateRange.some((date) => isUserOnEmploymentPause(u, date)) ||
            hasWorkedInRange(u, dateRange)),
      );
  }, [dateRange, radiographers]);

  // ── Calculations ──
  const statsData = useMemo(() => {
    return users.map((user) => {
      const stats = {
        name: user.name,
        totalWork: 0,
        onSite: 0,
        remote: 0,
        beitou: 0,
        dazhi: 0,
        off: 0,
        remarks: "",
        floorControl: 0,
        assist: 0,
        opening: 0,
        late: 0,
        scheduler: 0,
        bmd: 0,
        ct: 0,
        mr: 0,
        us: 0,
        techSupport: 0,
        proofreader: 0,
      };

      // Determine effective date range for this user
      let effectiveRange = dateRange;
      if (cycleMonthKey) {
        const saved = user.personalCycles?.[cycleMonthKey];
        const defaults = getDefaultDatesForMonth(cycleMonthKey);

        // Always use saved cycle if it exists to pick up memos even if dates are default
        if (saved) {
          effectiveRange = buildDateRange(saved.startDate, saved.endDate);
          // Use custom memo if available, otherwise show the date range as fallback
          stats.remarks =
            saved.memo || formatRangeShort(saved.startDate, saved.endDate);
        }
      }

      const coopDates: string[] = [];

      effectiveRange.forEach((dateStr) => {
        // Cloud Proofreading count should be independent of OFF status
        const cloudShifts = cloudSchedule.filter((cs) => {
          if (cs.date !== dateStr || cs.proofreaderUserId !== user.id)
            return false;

          const dShift = doctorShifts.find(
            (s) => s.date === dateStr && s.doctorId === cs.doctorId,
          );
          if (!dShift) return false;

          const station = (
            dShift.scheduled_station ||
            dShift.station ||
            ""
          ).toLowerCase();
          const location = (dShift.location || "").toLowerCase();

          // Exclude Banned, OFF, Dazhi, Taichung
          if (
            station.includes("禁排") ||
            station.includes("off") ||
            location.includes("大直") ||
            location.includes("台中") ||
            station.includes("大直") ||
            station.includes("台中")
          )
            return false;

          // Allow if Remote OR (Beitou AND (Imaging/Support))
          const isRemote = station.includes("遠") || station.includes("remote");
          const isImagingOrSupport =
            station.includes("影像") || station.includes("支援");

          return isRemote || isImagingOrSupport;
        });
        stats.proofreader += cloudShifts.length;

        const status = db.getUserStatusOnDate(user.id, dateStr);
        if (status === "OFF") {
          stats.off++;
          return;
        }

        let station = StationDefault.UNASSIGNED as string;
        let roles: string[] = [];

        const manualShift = shifts.find(
          (s) => s.userId === user.id && s.date === dateStr,
        );
        if (manualShift) {
          station = manualShift.station;
          roles = manualShift.specialRoles || [];
        }

        if (roles.includes("配合銷假")) {
          const d = new Date(dateStr);
          coopDates.push(`${d.getMonth() + 1}/${d.getDate()}`);
        }

        stats.totalWork++;

        if (station.includes("遠")) stats.remote++;
        else if (station.includes("大直")) stats.dazhi++;
        else stats.beitou++;

        if (station.includes("場控")) stats.floorControl++;
        if (station.includes("BMD") || station.includes("DX")) stats.bmd++;
        if (station.includes("CT")) stats.ct++;
        if (station.includes("MR")) stats.mr++;
        if (station.includes("US")) stats.us++;
        if (station.includes("技術支援")) stats.techSupport++;

        if (roles.includes(SPECIAL_ROLES.ASSIST)) stats.assist++;
        if (roles.includes(SPECIAL_ROLES.OPENING)) stats.opening++;
        if (roles.includes(SPECIAL_ROLES.LATE)) stats.late++;
        if (roles.includes(SPECIAL_ROLES.SCHEDULER)) stats.scheduler++;
      });

      if (coopDates.length > 0) {
        const coopStr = `配合調度: ${coopDates.join(", ")}`;
        stats.remarks = stats.remarks
          ? `${stats.remarks}；${coopStr}`
          : coopStr;
      }

      stats.onSite = stats.totalWork - stats.remote;
      return stats;
    });
  }, [users, dateRange, shifts, cloudSchedule, cycleMonthKey]);

  // ── Personal Cycle helpers (already moved up) ──

  const handleCycleChange = (
    userId: string,
    field: "startDate" | "endDate" | "memo",
    value: string,
  ) => {
    setRadiographers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          const currentCycles = u.personalCycles || {};
          const currentMonthData = currentCycles[selectedMonth] || {
            ...getDefaultDatesForMonth(selectedMonth),
            memo: "",
          };
          return {
            ...u,
            personalCycles: {
              ...currentCycles,
              [selectedMonth]: { ...currentMonthData, [field]: value },
            },
          };
        }
        return u;
      }),
    );
  };

  const handleSaveCycle = async (user: User) => {
    setSavingId(user.id);
    setSaveError(null);
    try {
      await db.updateUser(user.id, { personalCycles: user.personalCycles });
    } catch (err: any) {
      setSaveError(`儲存失敗: ${err.message || "未知錯誤"}`);
    } finally {
      setTimeout(() => setSavingId(null), 500);
    }
  };

  const handlePrevMonth = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    let py = year,
      pm = month - 1;
    if (pm === 0) {
      pm = 12;
      py--;
    }
    setSelectedMonth(`${py}-${String(pm).padStart(2, "0")}`);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    let ny = year,
      nm = month + 1;
    if (nm === 13) {
      nm = 1;
      ny++;
    }
    setSelectedMonth(`${ny}-${String(nm).padStart(2, "0")}`);
  };

  const updateSyncTask = (id: number, field: string, value: any) => {
    setSyncTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
    );
  };

  // ── Trigger Backend Sync ──
  const executeSync = async () => {
    const selectedTasks = syncTasks.filter((t) => t.selected);
    if (selectedTasks.length === 0) {
      alert("請至少選擇一個要同步的區塊！");
      return;
    }

    setIsSyncing(true);
    const payloadStr = JSON.stringify(selectedTasks);

    try {
      // 判斷是否為本地端開發環境
      // 測試 GitHub 同步，強制設為 false
      const isLocalhost = false;

      if (isLocalhost) {
        // 本地端維持原本打本機排程伺服器的邏輯
        const response = await fetch("/api/sync-stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ syncPayload: payloadStr }),
        });
        if (!response.ok) throw new Error("同步請求失敗，請確認後端服務狀態。");
        alert(`[本地端] 已成功觸發後台同步！`);
        setSyncModalOpen(false);
      } else {
        // 線上版觸發 GitHub Actions
        let ghToken = localStorage.getItem("GITHUB_PAT");
        if (!ghToken) {
          ghToken = window.prompt(
            "請輸入您的 GitHub Personal Access Token (PAT) 來觸發雲端同步：\n(只需輸入一次，會儲存在您的瀏覽器中)",
          );
          if (!ghToken) {
            setIsSyncing(false);
            return;
          }
          localStorage.setItem("GITHUB_PAT", ghToken.trim());
        }

        // 🔴 請將 YOUR_GITHUB_USERNAME 換成您的 GitHub 帳號名稱！
        const owner = "Penny-Liu";
        const repo = "schedule";
        const workflowId = "sync-stats.yml";

        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
          {
            method: "POST",
            headers: {
              Accept: "application/vnd.github.v3+json",
              Authorization: `Bearer ${ghToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ref: "main", // 若您的 GitHub 預設分支是 master，請將這裡改為 master
              inputs: {
                sync_payload: payloadStr,
              },
            }),
          },
        );

        if (
          response.status === 401 ||
          response.status === 403 ||
          response.status === 404
        ) {
          localStorage.removeItem("GITHUB_PAT");
          throw new Error(
            "GitHub Token 無效、沒有 repo 權限，或找不到該儲存庫。請重新整理頁面後再試一次！",
          );
        }
        if (!response.ok)
          throw new Error(`GitHub API 請求失敗 (狀態碼: ${response.status})`);

        alert(
          `[雲端] 已成功觸發 GitHub Actions 同步！\n由於雲端背景執行需要時間，請稍後幾分鐘再重新整理頁面查看最新資料。`,
        );
        setSyncModalOpen(false);
      }
    } catch (err: any) {
      alert(`同步發生錯誤: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Export Excel ──
  const handleExport = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("工作統計");
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
        "開機",
        "晚班",
        "排班",
        "校對",
      ];
      worksheet.addRow(headers);

      // 資料列
      statsData.forEach((row) => {
        worksheet.addRow([
          row.name,
          row.totalWork,
          row.onSite,
          row.remote,
          row.beitou,
          row.dazhi,
          row.off,
          row.remarks,
          row.floorControl,
          row.assist,
          row.bmd,
          row.ct,
          row.mr,
          row.us,
          row.techSupport,
          row.opening,
          row.late,
          row.scheduler,
          row.proofreader,
        ]);
      });

      const fileName = `工作統計_${selectedCycleId === "rolling" ? currentDate.toISOString().slice(0, 7) : "週期報表"}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
    } catch (e) {
      console.error("Excel export failed", e);
      alert("匯出 Excel 失敗，請稍後再試");
    }
  };

  const cycleName =
    selectedCycleId === "rolling"
      ? `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月 (自動範圍)`
      : cycles.find((c) => c.id === selectedCycleId)?.name;

  const [displayYear, displayMonth] = selectedMonth.split("-");
  const displayMonthStr = `${displayYear} 年 ${parseInt(displayMonth, 10)} 月`;

  const isSupervisorOrAdmin =
    currentUser.role === UserRole.SUPERVISOR ||
    currentUser.role === UserRole.SYSTEM_ADMIN;

  const canViewWorkload =
    currentUser.role === UserRole.SYSTEM_ADMIN ||
    currentUser.permissions?.includes(PERMISSIONS.VIEW_WORKLOAD_STATS);

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Sync Modal */}
      {syncModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <RefreshCw size={20} className="text-indigo-600" />
                後台資料同步設定
              </h3>
              <button
                onClick={() => setSyncModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-200"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-6 max-h-[70vh] overflow-y-auto">
              {syncTasks.map((task) => (
                <div
                  key={task.id}
                  className={`border rounded-xl p-4 transition-colors ${task.selected ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200 bg-white"}`}
                >
                  <label className="flex items-center gap-3 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={task.selected}
                      onChange={(e) =>
                        updateSyncTask(task.id, "selected", e.target.checked)
                      }
                      className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span
                      className={`font-bold ${task.selected ? "text-indigo-900" : "text-slate-600"}`}
                    >
                      [{task.id}/3] {task.name}
                    </span>
                  </label>
                  {task.selected && (
                    <div className="mt-4 pl-8 flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-600 w-20">
                          同步區間
                        </span>
                        <input
                          type="date"
                          value={task.start}
                          onChange={(e) =>
                            updateSyncTask(task.id, "start", e.target.value)
                          }
                          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <span className="text-slate-400">~</span>
                        <input
                          type="date"
                          value={task.end}
                          onChange={(e) =>
                            updateSyncTask(task.id, "end", e.target.value)
                          }
                          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      {task.id === 2 && (
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-slate-600 w-20">
                            報告/校對
                          </span>
                          <input
                            type="date"
                            value={task.reportStart}
                            onChange={(e) =>
                              updateSyncTask(
                                task.id,
                                "reportStart",
                                e.target.value,
                              )
                            }
                            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="text-slate-400">~</span>
                          <input
                            type="date"
                            value={task.reportEnd}
                            onChange={(e) =>
                              updateSyncTask(
                                task.id,
                                "reportEnd",
                                e.target.value,
                              )
                            }
                            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
              <button
                onClick={() => setSyncModalOpen(false)}
                className="px-5 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={executeSync}
                disabled={isSyncing}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={isSyncing ? "animate-spin" : ""}
                />
                {isSyncing ? "處理中..." : "開始同步"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex-none px-6 py-4 bg-white border-b border-slate-200 shadow-sm z-10">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <BarChart3 size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">工作狀況統計</h2>
              <p className="text-xs text-slate-500 font-medium">
                {activeTab === "stats"
                  ? `統計範圍: ${cycleName}${dateRange.length > 0 ? ` (${dateRange[0]} ~ ${dateRange[dateRange.length - 1]})` : ""}`
                  : activeTab === "cycles"
                    ? `個人週期微調 — ${displayMonthStr}`
                    : "從 Salesforce 同步各項檢查量與後處理統計"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tab Switcher */}
            <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
              <button
                onClick={() => setActiveTab("stats")}
                className={`px-3 py-1.5 rounded text-sm font-bold transition-all ${activeTab === "stats" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                <BarChart3 size={14} className="inline mr-1" />
                統計表
              </button>
              {isSupervisorOrAdmin && (
                <button
                  onClick={() => setActiveTab("cycles")}
                  className={`px-3 py-1.5 rounded text-sm font-bold transition-all ${activeTab === "cycles" ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  <Settings2 size={14} className="inline mr-1" />
                  個人週期
                </button>
              )}
              {canViewWorkload && (
                <button
                  onClick={() => setActiveTab("workload")}
                  className={`px-3 py-1.5 rounded text-sm font-bold transition-all ${activeTab === "workload" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  <Activity size={14} className="inline mr-1" />
                  工作量統計
                </button>
              )}
              {isSupervisorOrAdmin && (
                <button
                  onClick={() => setActiveTab("physician")}
                  className={`px-3 py-1.5 rounded text-sm font-bold transition-all ${activeTab === "physician" ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  <TrendingUp size={14} className="inline mr-1" />
                  醫師工作量
                </button>
              )}
            </div>

            {/* Sync Button */}
            {isSupervisorOrAdmin && (
              <button
                onClick={() => setSyncModalOpen(true)}
                disabled={isSyncing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all shadow-sm ${
                  isSyncing
                    ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
                }`}
              >
                <RefreshCw
                  size={14}
                  className={isSyncing ? "animate-spin" : ""}
                />
                {isSyncing ? "同步中..." : "後台同步"}
              </button>
            )}

            {activeTab === "stats" && (
              <>
                <div className="flex items-center bg-slate-50 hover:bg-slate-100 rounded-lg px-2 py-1.5 transition-colors border border-slate-200">
                  <Filter size={14} className="text-slate-500 mr-2" />
                  <select
                    value={selectedCycleId}
                    onChange={(e) => setSelectedCycleId(e.target.value)}
                    className="text-sm bg-transparent border-none focus:ring-0 text-slate-700 font-medium cursor-pointer py-0 pl-0 pr-8"
                  >
                    {cycles.length === 0 && (
                      <option value="rolling">當前月份</option>
                    )}
                    {cycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    {cycles.length > 0 && (
                      <option value="rolling">自訂月份 (Rolling)</option>
                    )}
                  </select>
                </div>

                {selectedCycleId === "rolling" && (
                  <input
                    type="month"
                    value={`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`}
                    onChange={(e) => setCurrentDate(new Date(e.target.value))}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}

                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm shadow-teal-200"
                >
                  <FileSpreadsheet size={16} /> 匯出 Excel
                </button>
              </>
            )}

            {activeTab === "cycles" && (
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200">
                <button
                  onClick={handlePrevMonth}
                  className="p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="font-bold text-gray-700 min-w-[100px] text-center">
                  {displayMonthStr}
                </div>
                <button
                  onClick={handleNextMonth}
                  className="p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6 relative">
        {/* ── Stats Tab ── */}
        {activeTab === "stats" && (
          <div
            className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
            id="stats-table"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                      姓名
                    </th>
                    <th className="px-2 py-3 text-center bg-indigo-50/50 text-indigo-700">
                      上班天數
                    </th>
                    <th className="px-2 py-3 text-center">現場天數</th>
                    <th className="px-2 py-3 text-center text-fuchsia-600">
                      遠班
                    </th>
                    <th className="px-2 py-3 text-center">北投天數</th>
                    <th className="px-2 py-3 text-center text-blue-600">
                      大直天數
                    </th>
                    <th className="px-2 py-3 text-center text-red-500">休假</th>
                    <th className="px-2 py-3 text-center text-amber-600 border-r border-slate-100">
                      備註
                    </th>
                    <th className="px-2 py-3 text-center bg-red-50/30 text-red-800">
                      場控
                    </th>
                    <th className="px-2 py-3 text-center bg-emerald-50/30 text-emerald-700">
                      輔班
                    </th>
                    <th className="px-2 py-3 text-center">BMD/DX</th>
                    <th className="px-2 py-3 text-center">CT</th>
                    <th className="px-2 py-3 text-center">MR</th>
                    <th className="px-2 py-3 text-center">US</th>
                    <th className="px-2 py-3 text-center text-lime-700 border-r border-slate-100">
                      技術支援
                    </th>
                    <th className="px-2 py-3 text-center bg-blue-50/30 text-blue-700">
                      開機
                    </th>
                    <th className="px-2 py-3 text-center bg-amber-50/30 text-amber-700">
                      晚班
                    </th>
                    <th className="px-2 py-3 text-center bg-red-50/30 text-red-700">
                      排班
                    </th>
                    <th className="px-2 py-3 text-center bg-purple-50/30 text-purple-700">
                      校對
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statsData.map((row, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-bold text-slate-800 sticky left-0 bg-white border-r border-slate-100">
                        {row.name}
                      </td>
                      <td className="px-2 py-2.5 text-center font-bold text-indigo-700 bg-indigo-50/10">
                        {row.totalWork}
                      </td>
                      <td className="px-2 py-2.5 text-center font-medium text-slate-700">
                        {row.onSite}
                      </td>
                      <td className="px-2 py-2.5 text-center text-slate-500">
                        {row.remote || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-slate-600">
                        {row.beitou}
                      </td>
                      <td className="px-2 py-2.5 text-center text-blue-600">
                        {row.dazhi || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-red-400 bg-red-50/5">
                        {row.off}
                      </td>
                      <td className="px-2 py-2.5 text-center text-amber-600 border-r border-slate-100 text-xs font-semibold">
                        {row.remarks || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-slate-600">
                        {row.floorControl || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-emerald-600 font-bold">
                        {row.assist || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-slate-500">
                        {row.bmd || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-slate-500">
                        {row.ct || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-slate-500">
                        {row.mr || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-slate-500">
                        {row.us || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-lime-700 border-r border-slate-100">
                        {row.techSupport || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-blue-600 font-medium">
                        {row.opening || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-amber-600 font-medium">
                        {row.late || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-red-600 font-medium">
                        {row.scheduler || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-purple-600 font-medium">
                        {row.proofreader || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Personal Cycles Tab ── */}
        {activeTab === "cycles" && isSupervisorOrAdmin && (
          <div className="max-w-6xl mx-auto flex flex-col gap-4">
            <p className="text-sm text-gray-500">
              設定每位放射師在選定月份的工作週期起訖日期與備忘。預設使用該月份對應的排班週期；有微調的人員會以琥珀色標示。
            </p>

            {saveError && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 border border-red-100">
                <AlertCircle className="shrink-0 mt-0.5" size={18} />
                <p className="text-sm">{saveError}</p>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-6 py-4 font-bold w-[18%]">
                        放射師姓名
                      </th>
                      <th className="px-6 py-4 font-bold w-[35%]">
                        本月週期範圍
                      </th>
                      <th className="px-6 py-4 font-bold w-[22%]">備忘</th>
                      <th className="px-6 py-4 font-bold text-center w-[12%]">
                        當期天數
                      </th>
                      <th className="px-6 py-4 font-bold text-center w-[13%]">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {radiographers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-12 text-center text-gray-400"
                        >
                          目前沒有放射師資料。
                        </td>
                      </tr>
                    ) : (
                      radiographers.map((user) => {
                        const defaultDates =
                          getDefaultDatesForMonth(selectedMonth);
                        const savedCycle = user.personalCycles?.[selectedMonth];
                        const currentMonthData = savedCycle || {
                          ...defaultDates,
                          memo: "",
                        };
                        const isCustomized =
                          !!savedCycle &&
                          (savedCycle.startDate !== defaultDates.startDate ||
                            savedCycle.endDate !== defaultDates.endDate);
                        const currentDays = calculateDays(
                          currentMonthData.startDate,
                          currentMonthData.endDate,
                        );

                        return (
                          <tr
                            key={user.id}
                            className={`transition-colors ${isCustomized ? "bg-amber-50 hover:bg-amber-100/60 border-l-4 border-amber-400" : "hover:bg-slate-50/50"}`}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-sm shrink-0"
                                  style={{
                                    backgroundColor: user.color || "#9CA3AF",
                                  }}
                                >
                                  {user.alias || user.name[0]}
                                </div>
                                <div>
                                  <div className="font-bold text-gray-800 text-sm">
                                    {user.name}
                                  </div>
                                  {getEmploymentPause(user) && (
                                    <div className="text-[10px] text-indigo-600 font-semibold">
                                      留停：
                                      {
                                        getEmploymentPause(user)?.startDate
                                      } ~ {getEmploymentPause(user)?.endDate}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                  <Calendar
                                    size={13}
                                    className="absolute left-2.5 top-2.5 text-gray-400"
                                  />
                                  <input
                                    type="date"
                                    value={currentMonthData.startDate}
                                    onChange={(e) =>
                                      handleCycleChange(
                                        user.id,
                                        "startDate",
                                        e.target.value,
                                      )
                                    }
                                    className="w-full pl-8 pr-1 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none"
                                  />
                                </div>
                                <span className="text-gray-400 font-bold shrink-0">
                                  ~
                                </span>
                                <div className="relative flex-1">
                                  <Calendar
                                    size={13}
                                    className="absolute left-2.5 top-2.5 text-gray-400"
                                  />
                                  <input
                                    type="date"
                                    value={currentMonthData.endDate}
                                    onChange={(e) =>
                                      handleCycleChange(
                                        user.id,
                                        "endDate",
                                        e.target.value,
                                      )
                                    }
                                    className="w-full pl-8 pr-1 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none"
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="relative">
                                <FileText
                                  size={13}
                                  className="absolute left-2.5 top-2.5 text-gray-400"
                                />
                                <input
                                  type="text"
                                  placeholder="備忘..."
                                  value={currentMonthData.memo}
                                  onChange={(e) =>
                                    handleCycleChange(
                                      user.id,
                                      "memo",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none"
                                />
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span
                                className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 font-bold rounded-lg border text-sm ${isCustomized ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-100"}`}
                              >
                                {currentDays} 天
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => handleSaveCycle(user)}
                                disabled={savingId === user.id}
                                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold transition-all w-20 mx-auto ${
                                  savingId === user.id
                                    ? "bg-green-100 text-green-700 pointer-events-none"
                                    : "bg-teal-600 text-white hover:bg-teal-700 active:scale-95 shadow-sm shadow-teal-200"
                                }`}
                              >
                                {savingId === user.id ? (
                                  "已儲存"
                                ) : (
                                  <>
                                    <Save size={14} /> 儲存
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Workload Tab ── */}
        {activeTab === "workload" && canViewWorkload && (
          <div className="absolute inset-0 z-10">
            <RadiographerWorkloadPage currentUser={currentUser} />
          </div>
        )}

        {/* ── Physician Workload Tab ── */}
        {activeTab === "physician" && isSupervisorOrAdmin && (
          <PhysicianWorkloadAnalysis currentUser={currentUser} />
        )}
      </div>
    </div>
  );
};

export default StatisticsPage;
