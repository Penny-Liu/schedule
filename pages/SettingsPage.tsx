import React, { useState, useMemo, useEffect } from "react";
import {
  User,
  UserRole,
  RosterCycle,
  SYSTEM_OFF,
  StationDefault,
  Holiday,
  DateEventType,
  CycleAnchor,
  PERMISSIONS,
} from "../types";
import { db } from "../services/store";
import { generateUUID } from "../services/utils";
import {
  Plus,
  Trash2,
  Save,
  Settings,
  Calendar,
  AlertCircle,
  Users,
  Clock,
  Globe,
  X,
  RefreshCw,
  Key,
  UserCircle,
  ChevronDown,
  CalendarPlus,
  FileSpreadsheet,
  Download,
  Upload,
  Tag,
} from "lucide-react";
import ConfirmModal from "../components/ConfirmModal";

interface SettingsPageProps {
  currentUser: User;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ currentUser }) => {
  const [stations, setStations] = useState<string[]>(db.getStations());
  const [requirements, setRequirements] = useState<Record<string, number[]>>(
    db.getStationRequirements(),
  );
  // Force Update: 2026-01-14
  const [cycles, setCycles] = useState<RosterCycle[]>(db.getCycles());
  const [holidays, setHolidays] = useState<Holiday[]>(db.getHolidays());

  // Input states
  const [newStation, setNewStation] = useState("");
  const [newCycle, setNewCycle] = useState<Partial<RosterCycle>>({
    name: "",
    startDate: "",
    endDate: "",
  });
  const [newHoliday, setNewHoliday] = useState<Partial<Holiday>>({
    date: "",
    name: "",
    type: DateEventType.NATIONAL,
  });
  const [cycleStartDate, setCycleStartDate] = useState(db.getCycleStartDate());
  const [anchors, setAnchors] = useState<CycleAnchor[]>(db.getCycleAnchors());

  const [newAnchor, setNewAnchor] = useState({ effective: "", anchor: "" });
  const [hmLocation, setHmLocation] = useState<"北投" | "大直">(
    currentUser.healthMgmtLocation === "大直" ? "大直" : "北投",
  );
  const [hmStations, setHmStations] = useState<string[]>(
    db.getHealthMgmtStations(
      currentUser.healthMgmtLocation === "大直" ? "大直" : "北投",
    ),
  );
  const [newHmStation, setNewHmStation] = useState("");
  const [hmTasks, setHmTasks] = useState<string[]>(
    db.getHealthMgmtTasks(
      currentUser.healthMgmtLocation === "大直" ? "大直" : "北投",
    ),
  );
  const [newHmTask, setNewHmTask] = useState("");
  const [hmTimes, setHmTimes] = useState<string[]>(
    db.getHealthMgmtTimes(
      currentUser.healthMgmtLocation === "大直" ? "大直" : "北投",
    ),
  );
  const [newHmTime, setNewHmTime] = useState("");
  const [hmCycles, setHmCycles] = useState<RosterCycle[]>(
    db.getHealthMgmtCycles(),
  );
  const [newHmCycle, setNewHmCycle] = useState<Partial<RosterCycle>>({
    name: "",
    startDate: "",
    endDate: "",
    location:
      currentUser.healthMgmtLocation === "北投" ||
      currentUser.healthMgmtLocation === "大直"
        ? currentUser.healthMgmtLocation
        : "北投",
  });

  // Password Change State
  const [passwordData, setPasswordData] = useState({
    old: "",
    new: "",
    confirm: "",
  });

  // Batch Generate State
  const [batchConfig, setBatchConfig] = useState({
    nth: "3", // 1, 2, 3, 4, last
    weekday: "5", // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    startMonth: new Date().toISOString().slice(0, 7),
    endMonth: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
      .toISOString()
      .slice(0, 7),
    name: "科會",
    type: DateEventType.NOTE,
    frequency: "1", // Default every 1 month
  });

  // Tab State
  const [activeTab, setActiveTab] = useState<
    "personal" | "radiographer" | "health_mgmt" | "system"
  >("personal");

  const isSupervisorOrAdmin =
    currentUser.role === UserRole.SUPERVISOR ||
    currentUser.role === UserRole.SYSTEM_ADMIN;
  const canManageHealthMgmt =
    currentUser.role === UserRole.SYSTEM_ADMIN ||
    currentUser.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT);
  const canManageDates =
    isSupervisorOrAdmin ||
    currentUser.role === UserRole.SCHEDULER ||
    currentUser.role === UserRole.PHYSICIAN_ADMIN ||
    canManageHealthMgmt;
  const isSystemAdmin = currentUser.role === UserRole.SYSTEM_ADMIN;
  const isFinanceOnly = currentUser.role === UserRole.FINANCE;
  const isHR =
    currentUser.role === UserRole.SCHEDULER ||
    currentUser.role === UserRole.PHYSICIAN_ADMIN;

  // Auto-switch away from restricted tabs
  useEffect(() => {
    if (activeTab === "radiographer" && !isSupervisorOrAdmin) {
      setActiveTab("personal");
    } else if (activeTab === "health_mgmt" && !canManageHealthMgmt) {
      setActiveTab("personal");
    } else if (
      activeTab === "system" &&
      !(isSupervisorOrAdmin || canManageHealthMgmt)
    ) {
      setActiveTab("personal");
    }
  }, [activeTab, isSupervisorOrAdmin, canManageHealthMgmt]);

  const [logFilterDateStart, setLogFilterDateStart] = useState<string>("");
  const [logFilterDateEnd, setLogFilterDateEnd] = useState<string>("");
  const [logFilterModule, setLogFilterModule] = useState<string>("");
  const [logFilterUser, setLogFilterUser] = useState<string>("");

  const filteredOperationLogs = useMemo(() => {
    return db.getOperationLogs().filter((log) => {
      const logDate = log.details.date || log.timestamp.slice(0, 10);
      if (logFilterDateStart) {
        if (logDate < logFilterDateStart) return false;
      }
      if (logFilterDateEnd) {
        if (logDate > logFilterDateEnd) return false;
      }
      if (logFilterModule && logFilterModule !== "all") {
        if (log.module !== logFilterModule) return false;
      }
      if (logFilterUser) {
        const keyword = logFilterUser.toLowerCase();
        if (!log.userName.toLowerCase().includes(keyword)) return false;
      }
      return true;
    });
  }, [logFilterDateStart, logFilterDateEnd, logFilterModule, logFilterUser]);

  // Template blocks state: [Block1, Block2, Block3]
  const [templateBlocks, setTemplateBlocks] = useState<string[]>(["", "", ""]);

  // Archive Date
  const [archiveDate, setArchiveDate] = useState<string>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10); // Default to 1 year ago
  });

  // Helper to parse template into blocks
  const parseTemplate = (text: string) => {
    const split1 = text.split("遠群");
    const b1 = split1[0] || "";
    let b2 = "";
    let b3 = "";
    if (split1.length > 1) {
      const rest = split1.slice(1).join("遠群"); // Content after first "遠群"
      const split2 = rest.split("三線支援");
      b2 = split2[0] || "";
      if (split2.length > 1) {
        b3 = split2.slice(1).join("三線支援"); // Content after "三線支援"
      }
    }
    return [b1, b2, b3];
  };

  useEffect(() => {
    const loadData = () => {
      setStations(db.getStations());
      setRequirements(db.getStationRequirements());
      setCycles(db.getCycles());
      setHolidays(db.getHolidays());
      setCycleStartDate(db.getCycleStartDate());
      setAnchors(db.getCycleAnchors());
      setHmStations(db.getHealthMgmtStations(hmLocation));
      setHmTasks(db.getHealthMgmtTasks(hmLocation));
      setHmTimes(db.getHealthMgmtTimes(hmLocation));
      setHmCycles(db.getHealthMgmtCycles());

      const currentTemplate = db.settings.lineCopyTemplate || "";
      if (currentTemplate) {
        setTemplateBlocks(parseTemplate(currentTemplate));
      }
    };

    const unsubscribe = db.subscribe(loadData);
    loadData();
    setNewHmCycle((prev) => ({ ...prev, location: hmLocation }));
    return () => unsubscribe();
  }, [hmLocation]);

  // Confirm Modal State
  const [confirmState, setConfirmState] = useState<{
    type:
      | "station"
      | "cycle"
      | "holiday"
      | "anchor"
      | "purge_data"
      | "batch_generate"
      | "db_cleanup"
      | "force_clear_month"
      | "import"
      | "reset_template";
    id: string;
    title: string;
    message: string;
    payload?: any; // extra data needed by handler
  } | null>(null);

  // Calculate duration helper
  const cycleDuration = useMemo(() => {
    if (!newCycle.startDate || !newCycle.endDate) return 0;
    const start = new Date(newCycle.startDate);
    const end = new Date(newCycle.endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 0;
  }, [newCycle.startDate, newCycle.endDate]);

  const hmCycleDuration = useMemo(() => {
    if (!newHmCycle.startDate || !newHmCycle.endDate) return 0;
    const start = new Date(newHmCycle.startDate);
    const end = new Date(newHmCycle.endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 0;
  }, [newHmCycle.startDate, newHmCycle.endDate]);

  // Station Handlers
  const handleAddStation = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      newStation &&
      !stations.includes(newStation) &&
      newStation !== SYSTEM_OFF
    ) {
      db.addStation(newStation);
      setStations(db.getStations());
      setRequirements(db.getStationRequirements());
      setNewStation("");
    }
  };

  const handleDeleteStationClick = (name: string) => {
    setConfirmState({
      type: "station",
      id: name,
      title: "刪除崗位確認",
      message: `確定要刪除崗位 "${name}" 嗎？此操作將同時移除該崗位的所有人力需求設定。`,
    });
  };

  const handleAddHmStation = (e: React.FormEvent) => {
    e.preventDefault();
    if (newHmStation && !hmStations.includes(newHmStation)) {
      const updated = [...hmStations, newHmStation];
      setHmStations(updated);
      db.updateHealthMgmtStations(updated, hmLocation);
      setNewHmStation("");
    }
  };

  const handleDeleteHmStation = async (name: string) => {
    const updated = hmStations.filter((s) => s !== name);
    setHmStations(updated);
    await db.updateHealthMgmtStations(updated, hmLocation);
  };

  const handleAddHmTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHmTask.trim()) return;
    if (hmTasks.includes(newHmTask.trim())) return;
    const updated = [...hmTasks, newHmTask.trim()];
    setHmTasks(updated);
    setNewHmTask("");
    await db.updateHealthMgmtTasks(updated, hmLocation);
  };

  const handleDeleteHmTask = async (name: string) => {
    const updated = hmTasks.filter((t) => t !== name);
    setHmTasks(updated);
    await db.updateHealthMgmtTasks(updated, hmLocation);
  };

  const handleAddHmTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHmTime.trim()) return;
    if (hmTimes.includes(newHmTime.trim())) return;
    const updated = [...hmTimes, newHmTime.trim()].sort();
    setHmTimes(updated);
    setNewHmTime("");
    await db.updateHealthMgmtTimes(updated, hmLocation);
  };

  const handleDeleteHmTime = async (time: string) => {
    const updated = hmTimes.filter((t) => t !== time);
    setHmTimes(updated);
    await db.updateHealthMgmtTimes(updated, hmLocation);
  };

  const handleAddHmCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !newHmCycle.name ||
      !newHmCycle.startDate ||
      !newHmCycle.endDate ||
      !newHmCycle.location
    )
      return;
    const cycle: RosterCycle = {
      id: generateUUID(),
      name: newHmCycle.name,
      startDate: newHmCycle.startDate,
      endDate: newHmCycle.endDate,
      location: newHmCycle.location,
    };
    await db.addHealthMgmtCycle(cycle);
    setHmCycles(db.getHealthMgmtCycles());
    setNewHmCycle({
      name: "",
      startDate: "",
      endDate: "",
      location:
        currentUser.healthMgmtLocation === "北投" ||
        currentUser.healthMgmtLocation === "大直"
          ? currentUser.healthMgmtLocation
          : "北投",
    });
  };

  const handleDeleteHmCycle = async (id: string) => {
    await db.deleteHealthMgmtCycle(id);
    setHmCycles(db.getHealthMgmtCycles());
  };

  const handleRequirementChange = (
    station: string,
    dayIndex: number,
    count: number,
  ) => {
    if (count < 0) return;
    db.updateStationRequirement(station, dayIndex, count);
    setRequirements({ ...db.getStationRequirements() });
  };

  // Cycle Anchor Handlers
  const handleAddAnchor = async () => {
    if (newAnchor.effective && newAnchor.anchor) {
      try {
        await db.addCycleAnchor(newAnchor.effective, newAnchor.anchor);
        setAnchors(db.getCycleAnchors()); // Refresh list
        setNewAnchor({ effective: "", anchor: "" });
      } catch (error: any) {
        alert("儲存重置點失敗: " + (error.message || "未知錯誤"));
        console.error("Save failed", error);
      }
    } else {
      alert("請輸入完整的生效日期與基準日");
    }
  };

  const handleRemoveAnchor = async (effectiveDate: string) => {
    setConfirmState({
      type: "anchor",
      id: effectiveDate,
      title: "刪除重置點",
      message: `確定要刪除生效日期為 ${effectiveDate} 的排班重置點嗎？`,
    });
  };

  // Cycle Handlers
  const handleAddCycle = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCycle.name && newCycle.startDate && newCycle.endDate) {
      if (newCycle.startDate > newCycle.endDate!) {
        alert("結束日期不能早於開始日期");
        return;
      }

      const cycle: RosterCycle = {
        id: generateUUID(),
        name: newCycle.name,
        startDate: newCycle.startDate,
        endDate: newCycle.endDate,
      };

      db.addCycle(cycle);
      setCycles(db.getCycles());
      setNewCycle({ name: "", startDate: "", endDate: "" });
    }
  };

  const handleDeleteCycleClick = (id: string) => {
    setConfirmState({
      type: "cycle",
      id: id,
      title: "刪除週期確認",
      message: "確定要刪除此排班週期嗎？",
    });
  };

  const handleUpdateCycleStartDate = () => {
    db.updateCycleStartDate(cycleStartDate);
    alert("已更新排班循環基準日！儀表板的四休二邏輯將依此日期重新計算。");
  };

  // Holiday Handlers
  const handleImportHolidays = () => {
    const count = db.importTaiwanHolidays();
    setHolidays(db.getHolidays());
    alert(`已成功匯入 ${count} 個台灣國定假日 (從今日起)`);
  };

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (newHoliday.date && newHoliday.name && newHoliday.type) {
      db.addHoliday(newHoliday as Holiday);
      setHolidays(db.getHolidays());
      setNewHoliday({ date: "", name: "", type: DateEventType.NATIONAL });
    }
  };

  const handleDeleteHolidayClick = (holiday: Holiday) => {
    // Small actions don't always need complex confirmation, but keeping consistent
    setConfirmState({
      type: "holiday",
      id: holiday.id || holiday.date,
      title: "移除特殊日期",
      message: `確定要移除 ${holiday.date} (${holiday.name}) 的設定嗎？`,
    });
  };

  const handleBatchGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const start = new Date(batchConfig.startMonth + "-01");
    const end = new Date(batchConfig.endMonth + "-01");

    if (start > end) {
      alert("結束月份不能早於開始月份");
      return;
    }

    const generatedDates: Holiday[] = [];
    let current = new Date(start);

    // Iterate through months
    while (current <= end) {
      const year = current.getFullYear();
      const month = current.getMonth(); // 0-11

      const targetWeekday = parseInt(batchConfig.weekday); // 0-6

      let dateFound = 0;

      if (batchConfig.nth === "last") {
        // Find Last Weekday
        // Go to next month day 0 (last day of this month)
        const lastDay = new Date(year, month + 1, 0);
        // Backtrack until we find the weekday
        for (let d = lastDay.getDate(); d >= 1; d--) {
          const checkDate = new Date(year, month, d);
          if (checkDate.getDay() === targetWeekday) {
            dateFound = d;
            break;
          }
        }
      } else {
        // Find Nth Weekday
        const nth = parseInt(batchConfig.nth);
        let count = 0;
        // Loop from day 1
        for (let d = 1; d <= 31; d++) {
          const checkDate = new Date(year, month, d);
          if (checkDate.getMonth() !== month) break; // Overflow check

          if (checkDate.getDay() === targetWeekday) {
            count++;
            if (count === nth) {
              dateFound = d;
              break;
            }
          }
        }
      }

      if (dateFound > 0) {
        // Construct YYYY-MM-DD
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dateFound).padStart(2, "0")}`;
        generatedDates.push({
          date: dateStr,
          name: batchConfig.name,
          type: batchConfig.type,
        });
      }

      // Next month logic with frequency
      current.setMonth(current.getMonth() + parseInt(batchConfig.frequency));
    }

    if (generatedDates.length > 0) {
      setConfirmState({
        type: "batch_generate",
        id: "",
        title: `批次新增 ${generatedDates.length} 筆特殊日期`,
        message: `即將新增以下日期：\n${generatedDates.map((d) => d.date).join(", ")}`,
        payload: generatedDates,
      });
    } else {
      alert("此區間內找不到符合規則的日期。");
    }
  };

  // Unified Confirm Handler
  const handleConfirmAction = async () => {
    if (!confirmState) return;

    if (confirmState.type === "station") {
      db.removeStation(confirmState.id);
      setStations(db.getStations());
      setRequirements(db.getStationRequirements());
    } else if (confirmState.type === "cycle") {
      db.deleteCycle(confirmState.id);
      setCycles(db.getCycles());
    } else if (confirmState.type === "holiday") {
      db.removeHoliday(confirmState.id);
      setHolidays(db.getHolidays());
    } else if (confirmState.type === "anchor") {
      try {
        await db.removeCycleAnchor(confirmState.id);
        setAnchors(db.getCycleAnchors());
      } catch (error: any) {
        alert("刪除失敗: " + (error.message || "未知錯誤"));
      }
    } else if (confirmState.type === "batch_generate") {
      const dates: Holiday[] = confirmState.payload || [];
      dates.forEach((h) => db.addHoliday(h));
      setHolidays(db.getHolidays());
    } else if (confirmState.type === "purge_data") {
      try {
        const result = await db.purgeOldData(archiveDate);
        alert(
          `清除完成！\n已移除：\n排班: ${result.shifts}\n醫師排班: ${result.doctorShifts}\n假單: ${result.leaves}`,
        );
      } catch (e: any) {
        alert("清除失敗: " + e.message);
      }
    } else if (confirmState.type === "db_cleanup") {
      try {
        const count = await db.cleanupDuplicateShifts();
        alert(`清理完成！共移除了 ${count} 筆重複資料。`);
      } catch (e) {
        alert("清理失敗，請查看 Console");
      }
    } else if (confirmState.type === "force_clear_month") {
      try {
        await db.forceClearMonth(confirmState.id);
        alert(`${confirmState.id} 資料已強制清空。請重新進行排班。`);
      } catch (e) {
        alert("清除失敗，請查看 Console");
      }
    } else if (confirmState.type === "reset_template") {
      const defaultTemplate = confirmState.payload;
      setTemplateBlocks(parseTemplate(defaultTemplate));
      db.settings.lineCopyTemplate = defaultTemplate;
      db.saveSettings();
    }
    setConfirmState(null);
  };

  // Data Archive Handlers
  const handleExportData = async () => {
    if (!archiveDate) return;
    try {
      const result = await db.archiveData(archiveDate);
      const jsonString = JSON.stringify(result, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `schedule_archive_${archiveDate}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("匯出失敗: " + e.message);
    }
  };

  const handlePurgeData = () => {
    if (!archiveDate) return;
    setConfirmState({
      type: "purge_data",
      id: archiveDate,
      title: "⚠️ 清除歷史資料",
      message: `確定要清除 ${archiveDate} 之前的所有資料嗎？\n\n這些資料將永久刪除無法復原！請確認已下載備份。`,
    });
  };

  const handleImportBackup = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      if (
        !confirm(
          `確定要匯入 ${file.name} 嗎？\n這將會覆寫現有相同 ID 的資料。建議先備份目前資料。`,
        )
      )
        return;

      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const json = JSON.parse(ev.target?.result as string);
          const result = await db.importData(json);
          alert(
            `匯入成功！\n\n已更新/新增：\n排班: ${result.shifts}\n醫師排班: ${result.doctorShifts}\n假單: ${result.leaves}`,
          );
        } catch (err: any) {
          alert("匯入失敗: " + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Password Handler
  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new !== passwordData.confirm) {
      alert("新密碼與確認密碼不符");
      return;
    }
    const currentStoredPass = currentUser.password || "1234";
    if (passwordData.old !== currentStoredPass) {
      alert("舊密碼錯誤");
      return;
    }

    db.changePassword(currentUser.id, passwordData.new);
    alert("密碼已成功修改，下次請使用新密碼登入。");
    setPasswordData({ old: "", new: "", confirm: "" });
  };

  // Format cycle name for display in list
  const formatCycleName = (name: string) => {
    // Regex to match "YYYY/MM" or "YYYY/M"
    const match = name.match(/^(\d{4})\/(\d{1,2})$/);
    if (match) {
      return `${match[1]}年第${match[2]}週期`;
    }
    return name;
  };

  const getEventTypeLabel = (type: DateEventType) => {
    switch (type) {
      case DateEventType.NATIONAL:
        return "國定假日";
      case DateEventType.MEETING:
        return "備忘"; // Unify Legacy Meeting as Memo
      case DateEventType.NOTE:
        return "備忘";
      case DateEventType.RADIOGRAPHER_NOTE:
        return "放射師備註";
      case DateEventType.DOCTOR_NOTE:
        return "醫師備註";
      case DateEventType.CLOSED:
        return "休診";
      default:
        return type;
    }
  };

  const getEventTypeColor = (type: DateEventType) => {
    switch (type) {
      case DateEventType.NATIONAL:
        return "text-red-600 bg-red-100";
      case DateEventType.MEETING:
        return "text-blue-600 bg-blue-100"; // Unify Legacy Meeting as Blue
      case DateEventType.NOTE:
        return "text-blue-600 bg-blue-100";
      case DateEventType.RADIOGRAPHER_NOTE:
        return "text-teal-600 bg-teal-100 border-teal-200";
      case DateEventType.DOCTOR_NOTE:
        return "text-purple-600 bg-purple-100 border-purple-200";
      case DateEventType.CLOSED:
        return "text-gray-600 bg-gray-200 border-gray-300";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

  // Filter out stations that shouldn't have quantity settings (OFF and UNASSIGNED)
  const displayStations = stations.filter(
    (s) => s !== SYSTEM_OFF && s !== StationDefault.UNASSIGNED,
  );

  if (isFinanceOnly) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <div className="p-2.5 bg-white border border-gray-200 rounded-xl shadow-sm">
            <Settings className="text-teal-600" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">個人設定</h2>
            <p className="text-sm text-gray-500">您僅可修改個人密碼</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <UserCircle size={16} className="text-teal-600" />
              修改密碼
            </h3>
          </div>
          <div className="p-6">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">
                  舊密碼
                </label>
                <input
                  type="password"
                  value={passwordData.old}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, old: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  placeholder="請輸入目前密碼"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">
                    新密碼
                  </label>
                  <input
                    type="password"
                    value={passwordData.new}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, new: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    placeholder="請輸入新密碼"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">
                    確認新密碼
                  </label>
                  <input
                    type="password"
                    value={passwordData.confirm}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        confirm: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    placeholder="再次輸入新密碼"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-lg transition-colors text-sm flex justify-center items-center gap-2 shadow-sm shadow-teal-200"
              >
                <Key size={16} /> 修改密碼
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto h-screen overflow-y-auto">
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={handleConfirmAction}
        title={confirmState?.title || ""}
        message={confirmState?.message || ""}
        confirmColor="red"
        confirmText="確定刪除"
      />

      <div className="mb-6 flex items-center gap-3">
        <div className="p-2.5 bg-white border border-gray-200 rounded-xl shadow-sm">
          <Settings className="text-teal-600" size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">系統與個人設定</h2>
          <p className="text-sm text-gray-500">
            修改密碼、管理排班週期與崗位需求
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto no-scrollbar bg-white rounded-xl shadow-sm p-1 gap-1">
        <button
          onClick={() => setActiveTab("personal")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === "personal"
              ? "bg-teal-600 text-white shadow-md"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          <UserCircle size={18} /> 個人設定
        </button>
        {isSupervisorOrAdmin && (
          <button
            onClick={() => setActiveTab("radiographer")}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "radiographer"
                ? "bg-teal-600 text-white shadow-md"
                : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Users size={18} /> 放射師設定
          </button>
        )}
        {canManageHealthMgmt && (
          <button
            onClick={() => setActiveTab("health_mgmt")}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "health_mgmt"
                ? "bg-teal-600 text-white shadow-md"
                : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Calendar size={18} /> 健管設定
          </button>
        )}
        {(isSupervisorOrAdmin || canManageHealthMgmt) && (
          <button
            onClick={() => setActiveTab("system")}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "system"
                ? "bg-teal-600 text-white shadow-md"
                : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Settings size={18} /> 系統管理
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        {activeTab === "personal" && (
          <>
            {/* Personal Settings (Available to ALL) */}
            <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <UserCircle size={16} className="text-teal-600" />
                  個人帳戶設定
                </h3>
              </div>
              <div className="p-6">
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      舊密碼
                    </label>
                    <input
                      type="password"
                      value={passwordData.old}
                      onChange={(e) =>
                        setPasswordData({
                          ...passwordData,
                          old: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                      placeholder="請輸入目前密碼"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">
                        新密碼
                      </label>
                      <input
                        type="password"
                        value={passwordData.new}
                        onChange={(e) =>
                          setPasswordData({
                            ...passwordData,
                            new: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                        placeholder="請輸入新密碼"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">
                        確認新密碼
                      </label>
                      <input
                        type="password"
                        value={passwordData.confirm}
                        onChange={(e) =>
                          setPasswordData({
                            ...passwordData,
                            confirm: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                        placeholder="再次輸入新密碼"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-lg transition-colors text-sm flex justify-center items-center gap-2 shadow-sm shadow-teal-200"
                  >
                    <Key size={16} /> 修改密碼
                  </button>
                </form>
              </div>
            </div>
          </>
        )}

        {activeTab === "system" && (
          <>
            {/* --- SYSTEM SETTINGS (ADMIN ONLY) --- */}
            {isSupervisorOrAdmin && (
              <>
                {/* Cycle Calculation Settings - SYSTEM ADMIN ONLY */}
                {isSystemAdmin && (
                  <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <RefreshCw size={16} className="text-gray-400" />
                        排班邏輯設定 (系統管理員專用)
                      </h3>
                    </div>
                    <div className="p-6">
                      <div className="space-y-4">
                        {/* Global Default (Legacy/Base) */}
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <label className="text-xs font-bold text-gray-500 mb-2 block">
                            全域預設循環基準日 (最初始設定)
                          </label>
                          <div className="flex gap-2 items-center">
                            <input
                              type="date"
                              value={cycleStartDate}
                              onChange={(e) =>
                                setCycleStartDate(e.target.value)
                              }
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm"
                            />
                            <button
                              type="button"
                              onClick={handleUpdateCycleStartDate}
                              className="bg-gray-800 hover:bg-gray-900 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-sm whitespace-nowrap"
                            >
                              更新預設
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">
                            這是系統最底層的預設值 (通常設為 2024/1/1 或
                            2025/11/6)。若沒有任何「重置點」覆蓋，將使用此日期計算。
                          </p>
                        </div>

                        <div className="border-t border-gray-100 my-2"></div>

                        {/* Dynamic Anchors */}
                        <div>
                          <div className="mb-3">
                            <h4 className="font-bold text-gray-700 text-sm mb-1">
                              排班重置點 (Cycle Anchors)
                            </h4>
                            <p className="text-xs text-gray-500">
                              設定新的「生效日期」，系統將從該日起，改以新的「循環基準日」重新計算四休二邏輯，不影響生效日之前的歷史排班。
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 mb-3">
                            <div>
                              <label className="text-xs font-bold text-slate-500 mb-1 block">
                                生效日期 (從這天起)
                              </label>
                              <input
                                type="date"
                                className="w-full text-sm border border-slate-300 rounded-lg px-2 py-1"
                                value={newAnchor.effective}
                                onChange={(e) =>
                                  setNewAnchor({
                                    ...newAnchor,
                                    effective: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-500 mb-1 block">
                                新的循環基準日 (Day 1)
                              </label>
                              <input
                                type="date"
                                className="w-full text-sm border border-slate-300 rounded-lg px-2 py-1"
                                value={newAnchor.anchor}
                                onChange={(e) =>
                                  setNewAnchor({
                                    ...newAnchor,
                                    anchor: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleAddAnchor}
                              className="col-span-2 mt-1 bg-teal-600 text-white text-xs font-bold py-1.5 rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center gap-1"
                            >
                              <Plus size={14} /> 新增重置點
                            </button>
                          </div>

                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm text-left">
                              <thead className="bg-slate-100 text-slate-500 font-bold text-xs">
                                <tr>
                                  <th className="px-3 py-2">生效日期</th>
                                  <th className="px-3 py-2">新基準日</th>
                                  <th className="px-3 py-2 text-right">操作</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {anchors.map((anchor, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 font-mono text-slate-700">
                                      {anchor.effectiveDate}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-slate-700">
                                      {anchor.anchorDate}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveAnchor(
                                            anchor.effectiveDate,
                                          )
                                        }
                                        className="text-red-400 hover:text-red-600 p-1"
                                        title="刪除"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                {anchors.length === 0 && (
                                  <tr>
                                    <td
                                      colSpan={3}
                                      className="px-3 py-4 text-center text-slate-400 text-xs italic"
                                    >
                                      目前沒有重置點，全期使用預設基準。
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Database Maintenance Tool (Available to Supervisor/Admin) */}
                <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                  <div className="px-6 py-4 border-b border-gray-100 bg-orange-50/50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      <AlertCircle size={16} className="text-orange-500" />
                      資料庫維護 (異常修復)
                    </h3>
                  </div>
                  <div className="p-6">
                    <p className="text-sm text-gray-600 mb-4">
                      若發生「排班儲存後跳回未指派」或「資料無法寫入」狀況，可能是因為舊系統產生了重複資料。
                      請點擊下方按鈕進行資料庫清理。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmState({
                          type: "db_cleanup",
                          id: "",
                          title: "掃描並修復重複資料",
                          message:
                            "確定要執行資料庫清理嗎？這將揃描所有排班並移除重複的無效資料。",
                        });
                      }}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-lg transition-colors text-sm flex justify-center items-center gap-2 shadow-sm shadow-orange-200"
                    >
                      <RefreshCw size={16} /> 掃描並修復重複資料
                    </button>

                    <div className="mt-6 pt-6 border-t border-gray-100">
                      <h4 className="font-bold text-red-600 text-sm mb-2 flex items-center gap-1">
                        <Trash2 size={14} /> 強制清除特定月份資料 (核彈選項)
                      </h4>
                      <p className="text-xs text-gray-500 mb-3">
                        如果上述掃描無效 (顯示 0
                        筆)，且該月份仍然無法寫入/一直跳回未指派，請使用此功能。
                        <br />
                        <span className="font-bold text-red-500">
                          警告：這將刪除該月份「所有」排班紀錄，請謹慎使用。
                        </span>
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="month"
                          id="forceCleanMonth"
                          className="border border-gray-300 rounded-lg px-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const monthInput = document.getElementById(
                              "forceCleanMonth",
                            ) as HTMLInputElement;
                            const yearMonth = monthInput.value;
                            if (!yearMonth) {
                              alert("請先選擇要清除的月份");
                              return;
                            }
                            setConfirmState({
                              type: "force_clear_month",
                              id: yearMonth,
                              title: `❗️ 強制清除 ${yearMonth} 全部排班`,
                              message: `【嚴重警告】您即將刪除 ${yearMonth} 的「所有」排班資料。\n\n這將無法復原！是否確定繼續？`,
                            });
                          }}
                          className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-4 py-2 rounded-lg text-sm transition-colors border border-red-200"
                        >
                          強制重置該月
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Database Storage Management (Archive & Cleanup) */}
                <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit mt-6">
                  <div className="px-6 py-4 border-b border-gray-100 bg-slate-50/50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      <FileSpreadsheet size={16} className="text-slate-500" />
                      資料庫容量管理 (封存與清理)
                    </h3>
                  </div>
                  <div className="p-6">
                    <p className="text-sm text-gray-600 mb-4">
                      為了避免資料庫空間不足，建議定期將過期資料下載備份，並從資料庫中移除。
                    </p>

                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 mb-4">
                      <label className="text-xs font-bold text-gray-500 mb-2 block">
                        過期基準日 (清除此日期之前的資料)
                      </label>
                      <input
                        type="date"
                        value={archiveDate}
                        onChange={(e) => setArchiveDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4"
                      />

                      <div className="flex gap-4">
                        <button
                          type="button"
                          onClick={handleExportData}
                          className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-2.5 rounded-lg transition-colors text-sm flex justify-center items-center gap-2 shadow-sm"
                        >
                          <Download size={16} /> 下載備份 (JSON)
                        </button>

                        <button
                          type="button"
                          onClick={handleImportBackup}
                          className="flex-1 bg-white border border-gray-300 hover:bg-emerald-50 text-emerald-700 font-bold py-2.5 rounded-lg transition-colors text-sm flex justify-center items-center gap-2 shadow-sm border-emerald-200"
                        >
                          <Upload size={16} /> 匯入備份
                        </button>

                        <button
                          type="button"
                          onClick={handlePurgeData}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg transition-colors text-sm flex justify-center items-center gap-2 shadow-sm shadow-red-200"
                        >
                          <Trash2 size={16} /> 清除舊資料
                        </button>
                      </div>

                      <p className="text-xs text-center text-gray-400 mt-2">
                        ※ 請務必先下載備份，再執行清除。
                      </p>
                    </div>
                  </div>
                </div>

                {/* Line Copy Template Settings */}
                <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      <Clock size={16} className="text-gray-400" />
                      Line 複製格式設定 (系統管理員專用)
                    </h3>
                  </div>
                  <div className="p-6">
                    <p className="text-sm text-gray-500 mb-2">
                      您可以自訂「複製文字」的內容格式。請使用下方的變數代碼進行排版，系統會自動帶入當日資料。
                    </p>
                    <div className="space-y-4 mb-4">
                      {/* Block 1 */}
                      <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">
                          區塊 1 (北投/影像醫師)
                        </label>
                        <textarea
                          className="w-full h-48 p-3 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 outline-none resize-y"
                          value={templateBlocks[0]}
                          onChange={(e) => {
                            const newBlocks = [...templateBlocks];
                            newBlocks[0] = e.target.value;
                            setTemplateBlocks(newBlocks);
                          }}
                          placeholder="請輸入格式範本..."
                        />
                      </div>

                      {/* Separator 1 */}
                      <div className="flex items-center gap-4">
                        <div className="h-px bg-gray-200 flex-1"></div>
                        <span className="text-xs font-bold text-teal-600 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">
                          系統分隔線：遠群
                        </span>
                        <div className="h-px bg-gray-200 flex-1"></div>
                      </div>

                      {/* Block 2 */}
                      <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">
                          區塊 2 (遠群/大直)
                        </label>
                        <textarea
                          className="w-full h-40 p-3 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 outline-none resize-y"
                          value={templateBlocks[1]}
                          onChange={(e) => {
                            const newBlocks = [...templateBlocks];
                            newBlocks[1] = e.target.value;
                            setTemplateBlocks(newBlocks);
                          }}
                        />
                      </div>

                      {/* Separator 2 */}
                      <div className="flex items-center gap-4">
                        <div className="h-px bg-gray-200 flex-1"></div>
                        <span className="text-xs font-bold text-teal-600 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">
                          系統分隔線：三線支援
                        </span>
                        <div className="h-px bg-gray-200 flex-1"></div>
                      </div>

                      {/* Block 3 */}
                      <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">
                          區塊 3 (其它)
                        </label>
                        <textarea
                          className="w-full h-24 p-3 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 outline-none resize-y"
                          value={templateBlocks[2]}
                          onChange={(e) => {
                            const newBlocks = [...templateBlocks];
                            newBlocks[2] = e.target.value;
                            setTemplateBlocks(newBlocks);
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 mb-4">
                      <button
                        type="button"
                        onClick={() => {
                          // Join blocks with forced delimiters
                          const finalTemplate = `${templateBlocks[0]}遠群${templateBlocks[1]}三線支援${templateBlocks[2]}`;
                          db.settings.lineCopyTemplate = finalTemplate;
                          db.saveSettings();
                          alert("格式已儲存！");
                        }}
                        className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                      >
                        <Save size={16} /> 儲存設定
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const defaultTemplate = `{{date}}
{{imaging_doctors}}

放射師人力
北投：{{beitou_count}} (客戶：{{beitou_clients}}  CTA  {{beitou_cta}})
BU領頭 場控：{{floor_control}}
MR : {{mr}}
US：{{us}}
CT: {{ct}}
BMD :{{bmd}}
{{support_section}}{{learning_section}}

遠群（{{remote_group_header}}）
{{remote_doctors_detail}}
遠：{{remote_radiographers}}

大直：{{dazhi_count}} （健檢 {{dazhi_clients}} 代謝 {{dazhi_metabolism_clients}} ）
{{dazhi_radiographers}}

三線支援：{{third_line_support}}`;
                          setConfirmState({
                            type: "reset_template",
                            id: "",
                            title: "回復預設格式",
                            message:
                              "確定要回復成系統預設格式嗎？您的修改將會遺失。",
                            payload: defaultTemplate,
                          });
                        }}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-bold"
                      >
                        回復預設值
                      </button>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <h4 className="text-xs font-bold text-slate-500 mb-2">
                        可用變數代碼 (點擊複製)
                      </h4>
                      <div className="flex flex-wrap gap-2 text-xs font-mono text-slate-700">
                        {[
                          "{{date}}",
                          "{{imaging_doctors}}",
                          "{{beitou_count}}",
                          "{{beitou_clients}}",
                          "{{beitou_cta}}",
                          "{{floor_control}}",
                          "{{mr}}",
                          "{{us}}",
                          "{{ct}}",
                          "{{bmd}}",
                          "{{support}}",
                          "{{support_section}}",
                          "{{learning_section}}",
                          "{{remote_group_header}}",
                          "{{remote_doctors_detail}}",
                          "{{remote_radiographers}}",
                          "{{dazhi_count}}",
                          "{{dazhi_clients}}",
                          "{{dazhi_metabolism_clients}}",
                          "{{dazhi_radiographers}}",
                          "{{third_line_support}}",
                        ].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(v);
                              alert(`已複製 ${v}`);
                            }}
                            className="bg-white border border-slate-300 px-2 py-1 rounded-lg hover:bg-slate-100 transition"
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {activeTab === "radiographer" && (
          <>
            {/* Radiographer Cycle Adjustment (Per-User) */}
            <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <Calendar size={16} className="text-gray-400" />
                  排班週期 (主管專用)
                </h3>
              </div>

              <div className="p-6 border-b border-gray-100">
                <form onSubmit={handleAddCycle} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      週期名稱 (格式建議: YYYY/NN)
                    </label>
                    <input
                      type="text"
                      value={newCycle.name}
                      onChange={(e) =>
                        setNewCycle({ ...newCycle, name: e.target.value })
                      }
                      placeholder="例：2025/12"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">
                        開始日期
                      </label>
                      <input
                        type="date"
                        value={newCycle.startDate}
                        onChange={(e) =>
                          setNewCycle({
                            ...newCycle,
                            startDate: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">
                        結束日期
                      </label>
                      <input
                        type="date"
                        value={newCycle.endDate}
                        onChange={(e) =>
                          setNewCycle({ ...newCycle, endDate: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                        required
                      />
                    </div>
                  </div>

                  {/* Duration Display */}
                  {cycleDuration > 0 && (
                    <div className="flex items-center gap-2 text-xs font-bold text-teal-600 bg-teal-50 px-3 py-2 rounded-lg border border-teal-100 animate-in fade-in slide-in-from-top-1">
                      <Clock size={14} />
                      自動計算：本週期共 {cycleDuration} 天
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold py-2.5 rounded-lg transition-colors text-sm flex justify-center items-center gap-2 border border-teal-200"
                  >
                    <Plus size={16} /> 新增週期
                  </button>
                </form>
              </div>

              <div className="p-2 overflow-y-auto max-h-[250px]">
                {cycles.map((cycle) => (
                  <div
                    key={cycle.id}
                    className="group p-3 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-200 mb-1"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-sm font-bold text-gray-800">
                          {formatCycleName(cycle.name)}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 font-medium">
                          {cycle.startDate} ~ {cycle.endDate}
                          <span className="text-gray-300">|</span>
                          <span className="text-gray-400">
                            {Math.ceil(
                              (new Date(cycle.endDate).getTime() -
                                new Date(cycle.startDate).getTime()) /
                                (1000 * 60 * 60 * 24),
                            ) + 1}{" "}
                            天
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCycleClick(cycle.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-white"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {cycles.length === 0 && (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    尚未設定週期
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {canManageDates && activeTab !== "personal" && (
          <>
            {/* Holiday / Event Management */}
            <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  特殊日期設定 (主管與排班專用)
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                    {holidays.length}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={handleImportHolidays}
                  className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1.5 rounded-lg font-bold transition-colors border border-blue-100"
                >
                  <Globe size={12} /> 匯入台灣假日
                </button>
              </div>

              <div className="p-4 border-b border-gray-100">
                <form
                  onSubmit={handleAddHoliday}
                  className="flex flex-col gap-2 mb-4"
                >
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={newHoliday.date}
                      onChange={(e) =>
                        setNewHoliday({ ...newHoliday, date: e.target.value })
                      }
                      className="w-1/3 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                      required
                    />
                    <input
                      type="text"
                      value={newHoliday.name}
                      onChange={(e) =>
                        setNewHoliday({ ...newHoliday, name: e.target.value })
                      }
                      placeholder="名稱 (例: 科會)"
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={newHoliday.type}
                      onChange={(e) =>
                        setNewHoliday({
                          ...newHoliday,
                          type: e.target.value as DateEventType,
                        })
                      }
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer bg-white"
                    >
                      <option value={DateEventType.NATIONAL}>
                        國定假日 (紅字)
                      </option>
                      <option value={DateEventType.NOTE}>
                        全院備忘 (藍字)
                      </option>
                      {(isSupervisorOrAdmin ||
                        currentUser.role === UserRole.SCHEDULER) && (
                        <option value={DateEventType.RADIOGRAPHER_NOTE}>
                          放射師備註 (綠字)
                        </option>
                      )}
                      <option value={DateEventType.DOCTOR_NOTE}>
                        醫師備註 (紫字)
                      </option>
                      <option value={DateEventType.CLOSED}>
                        休診 (全員預設休假)
                      </option>
                    </select>
                    <button
                      type="submit"
                      className="bg-gray-800 text-white px-6 rounded-lg hover:bg-gray-700 flex items-center justify-center"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </form>

                {/* Batch Generator - Collapsible UI */}
                <details className="group border border-blue-100 rounded-lg bg-blue-50/30 open:bg-blue-50/50 transition-all mb-4">
                  <summary className="cursor-pointer p-3 text-xs font-bold text-blue-700 flex items-center gap-2 select-none">
                    <RefreshCw size={14} /> 批量生成特殊日期 (進階)
                    <span className="ml-auto text-blue-400 group-open:rotate-180 transition-transform">
                      <ChevronDown size={14} />
                    </span>
                  </summary>
                  <div className="p-3 pt-0 border-t border-blue-100/50 mt-1">
                    <form
                      onSubmit={handleBatchGenerate}
                      className="space-y-3 mt-2"
                    >
                      <div className="flex items-center gap-2 text-sm text-gray-700 font-medium flex-wrap">
                        <span>每</span>
                        <input
                          type="number"
                          min="1"
                          value={batchConfig.frequency}
                          onChange={(e) =>
                            setBatchConfig({
                              ...batchConfig,
                              frequency: e.target.value,
                            })
                          }
                          className="w-16 bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-500 text-center"
                        />
                        <span>個月的 第</span>
                        <select
                          value={batchConfig.nth}
                          onChange={(e) =>
                            setBatchConfig({
                              ...batchConfig,
                              nth: e.target.value,
                            })
                          }
                          className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-500"
                        >
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="last">最後一個</option>
                        </select>
                        <span>個 星期</span>
                        <select
                          value={batchConfig.weekday}
                          onChange={(e) =>
                            setBatchConfig({
                              ...batchConfig,
                              weekday: e.target.value,
                            })
                          }
                          className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-500"
                        >
                          <option value="1">一</option>
                          <option value="2">二</option>
                          <option value="3">三</option>
                          <option value="4">四</option>
                          <option value="5">五</option>
                          <option value="6">六</option>
                          <option value="0">日</option>
                        </select>
                      </div>

                      <div className="flex gap-2 items-center">
                        <input
                          type="month"
                          value={batchConfig.startMonth}
                          onChange={(e) =>
                            setBatchConfig({
                              ...batchConfig,
                              startMonth: e.target.value,
                            })
                          }
                          className="w-1/2 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                          required
                        />
                        <span className="text-gray-400">~</span>
                        <input
                          type="month"
                          value={batchConfig.endMonth}
                          onChange={(e) =>
                            setBatchConfig({
                              ...batchConfig,
                              endMonth: e.target.value,
                            })
                          }
                          className="w-1/2 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                          required
                        />
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={batchConfig.name}
                          onChange={(e) =>
                            setBatchConfig({
                              ...batchConfig,
                              name: e.target.value,
                            })
                          }
                          placeholder="事件名稱"
                          className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                          required
                        />
                        <button
                          type="submit"
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded-lg text-sm font-bold shadow-sm transition-colors whitespace-nowrap"
                        >
                          生成
                        </button>
                      </div>
                    </form>
                  </div>
                </details>
              </div>

              <div className="p-2 overflow-y-auto max-h-[250px]">
                {holidays.filter((h) => {
                  // 1. If user is SCHEDULER, hide radiographer notes (legacy logic)
                  if (
                    currentUser.role === UserRole.SCHEDULER &&
                    h.type === DateEventType.RADIOGRAPHER_NOTE
                  )
                    return false;

                  // 2. If in Health Management tab, hide radiographer notes
                  if (
                    activeTab === "health_mgmt" &&
                    h.type === DateEventType.RADIOGRAPHER_NOTE
                  )
                    return false;

                  // 3. If user is NOT a radiographer (e.g. HM Supervisor), hide radiographer notes
                  if (
                    currentUser.isRadiographer === false &&
                    h.type === DateEventType.RADIOGRAPHER_NOTE
                  )
                    return false;

                  return true;
                }).length > 0 ? (
                  holidays
                    .filter((h) => {
                      if (
                        currentUser.role === UserRole.SCHEDULER &&
                        h.type === DateEventType.RADIOGRAPHER_NOTE
                      )
                        return false;
                      if (
                        activeTab === "health_mgmt" &&
                        h.type === DateEventType.RADIOGRAPHER_NOTE
                      )
                        return false;
                      if (
                        currentUser.isRadiographer === false &&
                        h.type === DateEventType.RADIOGRAPHER_NOTE
                      )
                        return false;
                      return true;
                    })
                    .map((h) => (
                      <div
                        key={h.id || `${h.date}-${h.name}`}
                        className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg text-sm group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="font-mono text-gray-500 font-bold bg-gray-100 px-2 py-0.5 rounded-lg text-xs">
                            {h.date}
                          </div>
                          <div className="font-bold text-gray-800">
                            {h.name}
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-lg font-bold border ${getEventTypeColor(h.type)}`}
                          >
                            {getEventTypeLabel(h.type)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteHolidayClick(h)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))
                ) : (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    無特殊日期設定
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === "system" &&
          (isSupervisorOrAdmin || canManageHealthMgmt) && (
            <>
              {/* Station Management - SYSTEM ADMIN ONLY */}
              {isSystemAdmin && (
                <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit xl:col-span-2">
                  <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                      <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        崗位與人力需求 (系統管理員專用)
                        <span className="text-xs font-semibold text-gray-500 px-2 py-0.5 bg-white border rounded-full">
                          {displayStations.length}
                        </span>
                      </h3>
                    </div>

                    <form onSubmit={handleAddStation} className="flex gap-2">
                      <input
                        type="text"
                        value={newStation}
                        onChange={(e) => setNewStation(e.target.value)}
                        placeholder="輸入新崗位名稱..."
                        className="w-48 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none shadow-sm transition-all"
                      />
                      <button
                        type="submit"
                        className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center text-sm font-medium shadow-sm shadow-teal-200"
                      >
                        <Plus size={16} className="mr-1" /> 新增
                      </button>
                    </form>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50/50 text-xs text-gray-500 font-semibold uppercase border-b border-gray-100">
                        <tr>
                          <th className="px-6 py-3 text-left w-48 font-bold text-gray-600">
                            崗位名稱
                          </th>
                          {weekDays.map((d, i) => (
                            <th
                              key={i}
                              className={`px-1 py-3 text-center w-16 ${i === 0 || i === 6 ? "text-red-500" : ""}`}
                            >
                              週{d}
                            </th>
                          ))}
                          <th className="px-6 py-3 text-right">移除</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {displayStations.map((station) => {
                          const reqs = requirements[station] || [
                            0, 0, 0, 0, 0, 0, 0,
                          ];
                          return (
                            <tr
                              key={station}
                              className="hover:bg-gray-50/50 transition-colors"
                            >
                              <td className="px-6 py-3 text-sm font-bold text-gray-700">
                                {station}
                              </td>
                              {reqs.map((count, dayIdx) => (
                                <td
                                  key={dayIdx}
                                  className="px-1 py-3 text-center"
                                >
                                  <input
                                    type="number"
                                    min="0"
                                    value={count}
                                    onChange={(e) =>
                                      handleRequirementChange(
                                        station,
                                        dayIdx,
                                        parseInt(e.target.value) || 0,
                                      )
                                    }
                                    className={`w-10 text-center text-sm rounded-lg py-1 outline-none transition-all font-medium 
                                                    ${count > 0 ? "text-teal-700 bg-teal-50 ring-1 ring-teal-100" : "text-gray-300 bg-gray-50"} 
                                                    focus:ring-2 focus:ring-teal-500 focus:bg-white`}
                                  />
                                </td>
                              ))}
                              <td className="px-6 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteStationClick(station)
                                  }
                                  className="text-gray-300 hover:text-red-500 transition-colors p-1.5 hover:bg-red-50 rounded"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {displayStations.length === 0 && (
                          <tr>
                            <td
                              colSpan={9}
                              className="p-12 text-center text-gray-400 text-sm"
                            >
                              尚未新增任何有效崗位
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit xl:col-span-2">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <FileSpreadsheet size={16} className="text-gray-400" />
                    操作日誌
                  </h3>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-1 xl:grid-cols-4 gap-3 mb-4">
                    <div className="space-y-1 text-sm text-gray-600">
                      <label className="block text-xs font-semibold text-gray-500">
                        起始日期
                      </label>
                      <input
                        type="date"
                        value={logFilterDateStart}
                        onChange={(e) => setLogFilterDateStart(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <label className="block text-xs font-semibold text-gray-500">
                        結束日期
                      </label>
                      <input
                        type="date"
                        value={logFilterDateEnd}
                        onChange={(e) => setLogFilterDateEnd(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <label className="block text-xs font-semibold text-gray-500">
                        排班類型
                      </label>
                      <select
                        value={logFilterModule}
                        onChange={(e) => setLogFilterModule(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="all">全部</option>
                        <option value="radiographer">放射師</option>
                        <option value="physician">醫師</option>
                        <option value="health_mgmt">健管</option>
                        <option value="cloud_schedule">影像雲</option>
                        <option value="anesthesia">麻護</option>
                      </select>
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <label className="block text-xs font-semibold text-gray-500">
                        操作者
                      </label>
                      <input
                        type="text"
                        value={logFilterUser}
                        onChange={(e) => setLogFilterUser(e.target.value)}
                        placeholder="搜尋操作者"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {filteredOperationLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100"
                      >
                        <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-gray-900">
                              {log.userName}
                            </span>
                            <span className="text-gray-500">•</span>
                            <span className="text-gray-600">
                              {new Date(log.timestamp).toLocaleString("zh-TW")}
                            </span>
                            <span className="text-gray-500">•</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                log.operation === "assign"
                                  ? "bg-green-100 text-green-800"
                                  : log.operation === "clear"
                                    ? "bg-red-100 text-red-800"
                                    : log.operation === "auto_schedule"
                                      ? "bg-blue-100 text-blue-800"
                                      : log.operation === "save_simulation"
                                        ? "bg-purple-100 text-purple-800"
                                        : log.operation === "任務調整"
                                          ? "bg-orange-100 text-orange-800"
                                          : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {log.operation === "assign"
                                ? "指派"
                                : log.operation === "clear"
                                  ? "清空"
                                  : log.operation === "auto_schedule"
                                    ? "自動排班"
                                    : log.operation === "save_simulation"
                                      ? "儲存模擬"
                                      : log.operation === "任務調整"
                                        ? "任務調整"
                                        : log.operation === "update"
                                          ? "更新"
                                          : log.operation}
                            </span>
                            <span className="text-gray-500">•</span>
                            <span className="text-gray-600 capitalize">
                              {log.module.replace("_", " ")}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-gray-700">
                            {log.details.date && (
                              <span>日期: {log.details.date} </span>
                            )}
                            {log.details.personName && (
                              <span>人員: {log.details.personName} </span>
                            )}
                            {log.details.station && (
                              <span>崗位: {log.details.station} </span>
                            )}
                            {log.details.location && (
                              <span>地點: {log.details.location} </span>
                            )}
                            {log.details.task && (
                              <span>任務: {log.details.task} </span>
                            )}
                            {log.details.affectedCount && (
                              <span>
                                影響數量: {log.details.affectedCount}{" "}
                              </span>
                            )}
                            {log.details.note && (
                              <span className="text-gray-500">
                                ({log.details.note})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredOperationLogs.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <FileSpreadsheet
                          size={48}
                          className="mx-auto mb-2 opacity-50"
                        />
                        <p>尚無操作記錄</p>
                      </div>
                    )}
                  </div>
                  {filteredOperationLogs.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => {
                          const logs = filteredOperationLogs;
                          const csvContent = [
                            [
                              "時間",
                              "操作者",
                              "操作",
                              "模組",
                              "日期",
                              "人員",
                              "崗位",
                              "地點",
                              "任務",
                              "備註",
                            ].join(","),
                            ...logs.map((log) =>
                              [
                                new Date(log.timestamp).toLocaleString("zh-TW"),
                                log.userName,
                                log.operation,
                                log.module,
                                log.details.date || "",
                                log.details.personName || "",
                                log.details.station || "",
                                log.details.currentTasks ||
                                  log.details.task ||
                                  "",
                                log.details.note || "",
                              ].join(","),
                            ),
                          ].join("\n");

                          const blob = new Blob([csvContent], {
                            type: "text/csv;charset=utf-8;",
                          });
                          const link = document.createElement("a");
                          link.href = URL.createObjectURL(blob);
                          link.download = `operation_logs_${new Date().toISOString().slice(0, 10)}.csv`;
                          link.click();
                        }}
                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                      >
                        <Download size={16} />
                        匯出 CSV
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

        {activeTab === "health_mgmt" && (
          <>
            {/* Location Selector for Settings */}
            {(!currentUser.healthMgmtLocation ||
              currentUser.healthMgmtLocation === "全部") && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 mb-6 flex gap-1 w-fit mx-auto">
                {["北投", "大直"].map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setHmLocation(loc as any)}
                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                      hmLocation === loc
                        ? "bg-teal-600 text-white shadow-md"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {loc} 院區設定
                  </button>
                ))}
              </div>
            )}

            {/* Health Management Station Management */}
            {canManageHealthMgmt && (
              <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <div>
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      {hmLocation}健管崗位管理 (主管專用)
                      <span className="text-xs font-semibold text-gray-500 px-2 py-0.5 bg-white border rounded-full">
                        {hmStations.length}
                      </span>
                    </h3>
                  </div>

                  <form onSubmit={handleAddHmStation} className="flex gap-2">
                    <input
                      type="text"
                      value={newHmStation}
                      onChange={(e) => setNewHmStation(e.target.value)}
                      placeholder="輸入新崗位..."
                      className="w-40 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                    />
                    <button
                      type="submit"
                      className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center text-sm font-medium"
                    >
                      <Plus size={16} />
                    </button>
                  </form>
                </div>

                <div className="p-4 flex flex-wrap gap-2 max-h-[250px] overflow-y-auto">
                  {hmStations.map((station) => (
                    <div
                      key={station}
                      className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg group hover:border-teal-300 transition-colors"
                    >
                      <span className="text-sm font-bold text-slate-700">
                        {station}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteHmStation(station)}
                        className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {hmStations.length === 0 && (
                    <div className="w-full text-center py-4 text-gray-400 text-sm italic">
                      尚未設定健管崗位
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Health Management Work Time Management */}
            {canManageHealthMgmt && (
              <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <div>
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      {hmLocation}健管上班時間管理 (主管專用)
                      <span className="text-xs font-semibold text-gray-500 px-2 py-0.5 bg-white border rounded-full">
                        {hmTimes.length}
                      </span>
                    </h3>
                  </div>

                  <form onSubmit={handleAddHmTime} className="flex gap-2">
                    <input
                      type="text"
                      value={newHmTime}
                      onChange={(e) => setNewHmTime(e.target.value)}
                      placeholder="例: 07:30-15:30"
                      className="w-40 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                    />
                    <button
                      type="submit"
                      className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center text-sm font-medium"
                    >
                      <Plus size={16} />
                    </button>
                  </form>
                </div>

                <div className="p-4 flex flex-wrap gap-2 max-h-[250px] overflow-y-auto">
                  {hmTimes.map((time) => (
                    <div
                      key={time}
                      className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg group hover:border-teal-300 transition-colors"
                    >
                      <span className="text-sm font-bold text-slate-700">
                        {time}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteHmTime(time)}
                        className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {hmTimes.length === 0 && (
                    <div className="w-full text-center py-4 text-gray-400 text-sm italic">
                      尚未設定上班時間
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Health Management Task Management */}
            {canManageHealthMgmt && (
              <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <div>
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      {hmLocation}健管業務任務管理 (主管專用)
                      <span className="text-xs font-semibold text-gray-500 px-2 py-0.5 bg-white border rounded-full">
                        {hmTasks.length}
                      </span>
                    </h3>
                  </div>

                  <form onSubmit={handleAddHmTask} className="flex gap-2">
                    <input
                      type="text"
                      value={newHmTask}
                      onChange={(e) => setNewHmTask(e.target.value)}
                      placeholder="輸入新任務..."
                      className="w-40 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                    />
                    <button
                      type="submit"
                      className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center text-sm font-medium"
                    >
                      <Plus size={16} />
                    </button>
                  </form>
                </div>

                <div className="p-4 flex flex-wrap gap-2 max-h-[250px] overflow-y-auto">
                  {hmTasks.map((task) => (
                    <div
                      key={task}
                      className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg group hover:border-teal-300 transition-colors"
                    >
                      <span className="text-sm font-bold text-slate-700">
                        {task}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteHmTask(task)}
                        className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {hmTasks.length === 0 && (
                    <div className="w-full text-center py-4 text-gray-400 text-sm italic">
                      尚未設定健管任務
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Health Management Cycle Management */}
            {canManageHealthMgmt && (
              <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col h-fit">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Calendar size={16} className="text-gray-400" />
                    {hmLocation}健管排班週期 (健管主管專用)
                  </h3>
                </div>

                <div className="p-6 border-b border-gray-100">
                  <form onSubmit={handleAddHmCycle} className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">
                        週期名稱 (格式建議: YYYY/NN)
                      </label>
                      <input
                        type="text"
                        value={newHmCycle.name}
                        onChange={(e) =>
                          setNewHmCycle({ ...newHmCycle, name: e.target.value })
                        }
                        placeholder="例：2026/03"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                        required
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">
                          起始日期
                        </label>
                        <input
                          type="date"
                          value={newHmCycle.startDate}
                          onChange={(e) =>
                            setNewHmCycle({
                              ...newHmCycle,
                              startDate: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                          required
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">
                          結束日期
                        </label>
                        <input
                          type="date"
                          value={newHmCycle.endDate}
                          onChange={(e) =>
                            setNewHmCycle({
                              ...newHmCycle,
                              endDate: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                          required
                        />
                      </div>
                      {(!currentUser.healthMgmtLocation ||
                        currentUser.healthMgmtLocation === "全部") && (
                        <div className="flex-[0.8]">
                          <label className="text-xs font-semibold text-gray-500 mb-1 block">
                            所屬院區
                          </label>
                          <select
                            value={newHmCycle.location || hmLocation}
                            onChange={(e) =>
                              setNewHmCycle({
                                ...newHmCycle,
                                location: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all bg-white"
                            required
                          >
                            <option value="北投">北投</option>
                            <option value="大直">大直</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Duration Display */}
                    {hmCycleDuration > 0 && (
                      <div className="flex items-center gap-2 text-xs font-bold text-teal-600 bg-teal-50 px-3 py-2 rounded-lg border border-teal-100 animate-in fade-in slide-in-from-top-1">
                        <Clock size={14} />
                        自動計算：本週期共 {hmCycleDuration} 天
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold py-2.5 rounded-lg transition-colors text-sm flex justify-center items-center gap-2 border border-teal-200"
                    >
                      <CalendarPlus size={18} /> 新增週期
                    </button>
                  </form>
                </div>

                <div className="p-2 overflow-y-auto max-h-[350px]">
                  {hmCycles
                    .filter((cycle) => {
                      if (
                        currentUser.healthMgmtLocation &&
                        currentUser.healthMgmtLocation !== "全部"
                      ) {
                        return (
                          cycle.location === currentUser.healthMgmtLocation ||
                          !cycle.location
                        );
                      }
                      return (
                        cycle.location === hmLocation ||
                        (!cycle.location && hmLocation === "北投")
                      );
                    })
                    .map((cycle) => (
                      <div
                        key={cycle.id}
                        className={`group p-3 hover:bg-gray-50 rounded-lg transition-colors border ${cycle.location === "大直" ? "border-rose-100 bg-rose-50/10" : "border-teal-100 bg-teal-50/10"} mb-2`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div
                              className={`p-2 rounded-lg ${cycle.location === "大直" ? "bg-rose-50 text-rose-600" : "bg-teal-50 text-teal-600"}`}
                            >
                              <Calendar size={18} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 block mb-0.5">
                                <span className="text-sm font-bold text-gray-800">
                                  {formatCycleName(cycle.name)}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cycle.location === "大直" ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-teal-50 text-teal-600 border-teal-100"}`}
                                >
                                  {cycle.location || "北投"}專區
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 flex items-center gap-1 font-medium">
                                {cycle.startDate} ~ {cycle.endDate}
                                <span className="text-gray-300">|</span>
                                <span className="text-gray-400">
                                  {Math.ceil(
                                    (new Date(cycle.endDate).getTime() -
                                      new Date(cycle.startDate).getTime()) /
                                      (1000 * 60 * 60 * 24),
                                  ) + 1}{" "}
                                  天
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteHmCycle(cycle.id)}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-white rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  {hmCycles.filter((cycle) => {
                    if (
                      currentUser.healthMgmtLocation &&
                      currentUser.healthMgmtLocation !== "全部"
                    ) {
                      return (
                        cycle.location === currentUser.healthMgmtLocation ||
                        !cycle.location
                      );
                    }
                    return true;
                  }).length === 0 && (
                    <div className="p-8 text-center text-gray-400 italic text-sm">
                      尚未設定健管週期
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-800 p-4 rounded-xl border border-blue-100 flex gap-4 text-sm items-start shadow-sm">
        <div className="p-2 bg-white rounded-lg shadow-sm text-blue-500">
          <AlertCircle size={20} />
        </div>
        <div>
          <h4 className="font-bold mb-1 text-blue-900">設定小提示</h4>
          <ul className="list-disc pl-4 space-y-1 text-blue-700/80 text-xs">
            <li>
              「休診」日期：系統會自動將當日所有人員預設為「休假」，除非有手動排班覆蓋。
            </li>
            <li>「備忘」日期：僅作為行事曆標記，不影響排班邏輯。</li>
            <li>更新「循環基準日」會改變所有人四休二的計算起點。</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
