import React, { useState, useMemo, useEffect } from "react";
import { User, StationDefault, SPECIAL_ROLES } from "../types";
import { db } from "../services/store";
import {
  BarChart3,
  FileSpreadsheet,
  Edit3,
  Save,
  X,
  UploadCloud,
  Tag,
  MessageSquare,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Check,
  Plus,
} from "lucide-react";
import ExcelJS from "exceljs";
import { isUserOnEmploymentPause, generateUUID } from "../services/utils";

type WorkloadFieldKey =
  | "mr"
  | "mrLargeMale"
  | "mrLargeFemale"
  | "mrMedium"
  | "mrSmall"
  | "us"
  | "usA"
  | "usBreast"
  | "usHeart"
  | "usThy"
  | "usCCA"
  | "usNeck"
  | "usPelvisFemale"
  | "usPelvisMale"
  | "workDays"
  | "floorControl"
  | "assist"
  | "scheduler"
  | "ct"
  | "cta"
  | "ctaPostProcessing"
  | "dx"
  | "mg"
  | "bmd"
  | "reportTyping"
  | "proofreader"
  | "tsmcReport";

const workloadFieldMeta: { key: WorkloadFieldKey; label: string }[] = [
  { key: "workDays", label: "上班天數" },
  { key: "floorControl", label: "場控" },
  { key: "assist", label: "輔控" },
  { key: "scheduler", label: "排班" },
  { key: "mr", label: "MR" },
  { key: "mrLargeMale", label: "MR大男" },
  { key: "mrLargeFemale", label: "MR大女" },
  { key: "mrMedium", label: "MR中" },
  { key: "mrSmall", label: "MR小" },
  { key: "us", label: "US" },
  { key: "usA", label: "腹" },
  { key: "usBreast", label: "乳" },
  { key: "usHeart", label: "心" },
  { key: "usThy", label: "甲" },
  { key: "usCCA", label: "頸" },
  { key: "usPelvisFemale", label: "P女" },
  { key: "usPelvisMale", label: "P男" },
  { key: "ct", label: "CT" },
  { key: "cta", label: "CTA" },
  { key: "ctaPostProcessing", label: "CTA後處理" },
  { key: "dx", label: "DX" },
  { key: "mg", label: "MG" },
  { key: "bmd", label: "BMD" },
  { key: "reportTyping", label: "報告登打" },
  { key: "proofreader", label: "影像校對" },
  { key: "tsmcReport", label: "台積電報告" },
];

const defaultWorkloadWeights: Record<WorkloadFieldKey, number> = {
  workDays: 0,
  floorControl: 1,
  assist: 1,
  scheduler: 1,
  mr: 1,
  mrLargeMale: 1,
  mrLargeFemale: 1,
  mrMedium: 1,
  mrSmall: 1,
  us: 1,
  usA: 1,
  usBreast: 1,
  usHeart: 1,
  usThy: 1,
  usCCA: 1,
  usNeck: 1,
  usPelvisFemale: 1,
  usPelvisMale: 1,
  ct: 1,
  cta: 1,
  ctaPostProcessing: 1,
  dx: 1,
  mg: 1,
  bmd: 1,
  reportTyping: 1,
  proofreader: 1,
  tsmcReport: 1,
};

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
  const [importTarget, setImportTarget] =
    useState<WorkloadFieldKey>("reportTyping");
  const [weights, setWeights] = useState<Record<WorkloadFieldKey, number>>(
    () => ({
      ...defaultWorkloadWeights,
      ...(db.settings.radiographerWorkloadWeights || {}),
    }),
  );
  const [isSavingWeights, setIsSavingWeights] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Groups / classification
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [groups, setGroups] = useState<{id: string; name: string}[]>(
    () => (db.settings as any).radiographerGroups || []
  );
  const [groupAssignments, setGroupAssignments] = useState<Record<string, string>>(
    () => (db.settings as any).radiographerGroupAssignments || {}
  );
  const [newGroupName, setNewGroupName] = useState('');

  // LINE copy feedback
  const [lineCopied, setLineCopied] = useState(false);

  const onsiteFieldKeys: WorkloadFieldKey[] = [
    "mr",
    "mrLargeMale",
    "mrLargeFemale",
    "mrMedium",
    "mrSmall",
    "us",
    "usA",
    "usBreast",
    "usHeart",
    "usThy",
    "usCCA",
    "usNeck",
    "usPelvisFemale",
    "usPelvisMale",
    "floorControl",
    "assist",
    "scheduler",
    "ct",
    "cta",
    "ctaPostProcessing",
    "dx",
    "mg",
    "bmd",
  ];

  const scheduleDerivedFieldKeys: WorkloadFieldKey[] = [
    "workDays",
    "floorControl",
    "assist",
    "scheduler",
  ];

  const computeScheduleFields = (userId: string) => {
    const userShifts = shifts.filter(
      (s) =>
        s.userId === userId &&
        generalDates.includes(s.date) &&
        s.station !== StationDefault.UNASSIGNED &&
        s.station !== StationDefault.OFF &&
        s.station !== "休假",
    );

    const floorControl = userShifts.filter((shift) =>
      shift.station.includes("場控"),
    ).length;

    const assist = userShifts.filter(
      (shift) =>
        shift.specialRoles.includes(SPECIAL_ROLES.ASSIST) ||
        shift.station.includes("輔控") ||
        shift.station === "輔",
    ).length;

    const scheduler = userShifts.filter(
      (shift) =>
        shift.specialRoles.includes(SPECIAL_ROLES.SCHEDULER) ||
        shift.station.includes("排班"),
    ).length;

    return { floorControl, assist, scheduler };
  };

  const remoteFieldKeys: WorkloadFieldKey[] = ["reportTyping", "proofreader", "tsmcReport"];

  const computeUnits = (row: any, keys: WorkloadFieldKey[]) =>
    keys.reduce(
      (sum, field) => sum + ((row as any)[field] || 0) * weights[field],
      0,
    );

  const computeTotalUnits = (row: any) =>
    computeUnits(row, [...onsiteFieldKeys, ...remoteFieldKeys]);


  const getHeaderStyle = (field: WorkloadFieldKey) => {
    if (field === "ct" || field === "cta" || field === "ctaPostProcessing") {
      return "text-teal-600 bg-teal-50/50";
    }
    if (
      field === "floorControl" ||
      field === "assist" ||
      field === "scheduler"
    ) {
      return "text-slate-700 bg-slate-50/50";
    }
    if (field === "reportTyping") {
      return "text-indigo-600 bg-indigo-50/50";
    }
    if (field === "proofreader") {
      return "text-purple-600 bg-purple-50/50";
    }
    if (field === "tsmcReport") {
      return "text-orange-600 bg-orange-50/50";
    }
    return "";
  };

  const shouldRenderCategorySeparator = (field: WorkloadFieldKey) =>
    [
      "scheduler",
      "mrSmall",
      "usPelvisMale",
      "ctaPostProcessing",
      "bmd",
    ].includes(field);

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
        mrLargeMale: 0,
        mrLargeFemale: 0,
        mrMedium: 0,
        mrSmall: 0,
        us: 0,
        usA: 0,
        usBreast: 0,
        usHeart: 0,
        usThy: 0,
        usCCA: 0,
        usNeck: 0,
        usPelvisFemale: 0,
        usPelvisMale: 0,
        floorControl: 0,
        assist: 0,
        scheduler: 0,
        ct: 0,
        cta: 0,
        ctaPostProcessing: 0,
        dx: 0,
        mg: 0,
        bmd: 0,
        reportTyping: 0,
        proofreader: 0,
        tsmcReport: 0,
        totalUnits: 0,
      };

      const userWorkloads = workloads.filter(
        (w) => w.radiographerName === user.name && w.date === currentMonth,
      );

      if (userWorkloads.length > 0) {
        stats.id = userWorkloads[0].id;
        userWorkloads.forEach((w: any) => {
          stats.mr += w.mr || 0;
          stats.mrLargeMale += w.mrLargeMale || w.mr_large_male || 0;
          stats.mrLargeFemale += w.mrLargeFemale || w.mr_large_female || 0;
          stats.mrMedium += w.mrMedium || w.mr_medium || 0;
          stats.mrSmall += w.mrSmall || w.mr_small || 0;
          stats.us += w.us || 0;
          stats.usA += w.usA || w.us_a || 0;
          stats.usBreast += w.usBreast || w.us_breast || 0;
          stats.usHeart += w.usHeart || w.us_heart || 0;
          stats.usThy += w.usThy || w.us_thy || 0;
          stats.usCCA += w.usCCA || w.us_cca || 0;
          stats.usNeck += w.usNeck || w.us_neck || 0;
          stats.usPelvisFemale += w.usPelvisFemale || w.us_pelvis_female || 0;
          stats.usPelvisMale += w.usPelvisMale || w.us_pelvis_male || 0;
          stats.ct += w.ct || 0;
          stats.dx += w.dx || 0;
          stats.mg += w.mg || 0;
          stats.bmd += w.bmd || 0;
          stats.cta += w.cta || 0;
          stats.ctaPostProcessing += w.ctaPostProcessing || w.cta_post_processing || 0;
          stats.reportTyping += w.reportEntry || w.reportTyping || 0;
          stats.proofreader += w.imageProofing || w.proofreader || 0;
          stats.tsmcReport += w.tsmcReport || w.tsmc_report || 0;
        });
      }

      // 優先使用個人週期（如有），否則 fallback 到全域 generalDates
      const personalCycle = user.personalCycles?.[currentMonth];
      const userDates = personalCycle
        ? buildDateRange(personalCycle.startDate, personalCycle.endDate)
        : generalDates;

      // 從排班計算上班天數與場控/輔控/排班
      const userShiftsInRange = shifts.filter(
        (s) =>
          s.userId === user.id &&
          userDates.includes(s.date) &&
          s.station !== StationDefault.UNASSIGNED &&
          s.station !== StationDefault.OFF &&
          s.station !== "休假",
      );
      stats.workDays = userShiftsInRange.length;

      const floorControl = userShiftsInRange.filter((s) => s.station.includes("場控")).length;
      const assist = userShiftsInRange.filter(
        (s) =>
          s.specialRoles.includes(SPECIAL_ROLES.ASSIST) ||
          s.station.includes("輔控") ||
          s.station === "輔",
      ).length;
      const scheduler = userShiftsInRange.filter(
        (s) =>
          s.specialRoles.includes(SPECIAL_ROLES.SCHEDULER) ||
          s.station.includes("排班"),
      ).length;
      stats.floorControl = floorControl;
      stats.assist = assist;
      stats.scheduler = scheduler;


      stats.onsiteUnits = computeUnits(stats, onsiteFieldKeys);
      stats.remoteUnits = computeUnits(stats, remoteFieldKeys);
      stats.totalUnits = computeTotalUnits(stats);
      return stats;
    });
  }, [radiographers, workloads, currentMonth, weights, generalDates, shifts]);

  // Sorted display data (must be after workloadData)
  const displayData = useMemo(() => {
    const base: any[] = isEditing ? Object.values(editingData) : workloadData;
    if (!sortField) return base;
    return [...base].sort((a, b) => {
      let va: number, vb: number;
      if (sortField === 'onsiteUnits') { va = computeUnits(a, onsiteFieldKeys); vb = computeUnits(b, onsiteFieldKeys); }
      else if (sortField === 'remoteUnits') { va = computeUnits(a, remoteFieldKeys); vb = computeUnits(b, remoteFieldKeys); }
      else if (sortField === 'totalUnits') { va = computeTotalUnits(a); vb = computeTotalUnits(b); }
      else { va = Number(a[sortField]) || 0; vb = Number(b[sortField]) || 0; }
      const numA = Number(va) || 0;
      const numB = Number(vb) || 0;
      if (numA !== numB) return sortDir === 'asc' ? numA - numB : numB - numA; return a.name.localeCompare(b.name);
    });
  }, [workloadData, editingData, isEditing, sortField, sortDir, weights]);

  const renderSortTh = (field: string, label: string, className = '') => {
    const active = sortField === field;
    return (
      <th
        key={field}
        onClick={() => handleSort(field)}
        className={`px-4 py-3 text-center cursor-pointer select-none hover:bg-slate-200 transition-colors ${className}`}
        title={`點擊以依「${label}」排序`}
      >
        <span className="flex items-center justify-center gap-1">
          {label}
          {active ? (sortDir === 'asc' ? <ChevronUp size={11}/> : <ChevronDown size={11}/>) : <ChevronsUpDown size={11} className="opacity-30"/>}
        </span>
      </th>
    );
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === 'desc') setSortDir('asc');
      else setSortField(null);
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

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

  const handleWeightChange = (field: WorkloadFieldKey, value: string) => {
    setWeights((prev) => ({
      ...prev,
      [field]: parseFloat(value) || 0,
    }));
  };

  // ── Group management ──────────────────────────────────────────
  const persistGroups = async (g: typeof groups, a: typeof groupAssignments) => {
    (db.settings as any).radiographerGroups = g;
    (db.settings as any).radiographerGroupAssignments = a;
    await db.saveSettings();
  };

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    const updated = [...groups, { id: generateUUID(), name: newGroupName.trim() }];
    setGroups(updated);
    setNewGroupName('');
    await persistGroups(updated, groupAssignments);
  };

  const handleDeleteGroup = async (id: string) => {
    const updated = groups.filter(g => g.id !== id);
    const newA = { ...groupAssignments };
    Object.keys(newA).forEach(uid => { if (newA[uid] === id) delete newA[uid]; });
    setGroups(updated);
    setGroupAssignments(newA);
    await persistGroups(updated, newA);
  };

  const handleRenameGroup = async (id: string, name: string) => {
    const updated = groups.map(g => g.id === id ? { ...g, name } : g);
    setGroups(updated);
    await persistGroups(updated, groupAssignments);
  };

  const handleAssignGroup = async (userId: string, groupId: string) => {
    const updated = { ...groupAssignments };
    if (!groupId) delete updated[userId];
    else updated[userId] = groupId;
    setGroupAssignments(updated);
    await persistGroups(groups, updated);
  };

  const handleMoveGroup = (id: string, dir: 'up' | 'down') => {
    setGroups(prev => {
      const idx = prev.findIndex(g => g.id === id);
      if (idx < 0) return prev;
      const newIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const updated = [...prev];
      [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
      // fire-and-forget persist
      persistGroups(updated, groupAssignments);
      return updated;
    });
  };

  // ── LINE text (shared by preview + copy) ─────────────────────
  const lineText = useMemo(() => {
    const startDate = generalDates[0] || '';
    const endDate = generalDates[generalDates.length - 1] || '';
    const days = generalDates.length;
    const [y, m] = currentMonth.split('-').map(Number);
    const cycle = cycles.find(c => c.name === `${y}/${String(m).padStart(2,'0')}` || c.name === `${y}/${m}`);
    const mm = String(m).padStart(2, '0');
    const header = `${y}第${mm}週期 （${startDate.slice(5).replace('-','/')}~${endDate.slice(5).replace('-','/')}）  ${days}天`;

    const grouped: Record<string, any[]> = {};
    const unassigned: any[] = [];
    groups.forEach(g => { grouped[g.id] = []; });
    displayData.forEach(row => {
      const user = radiographers.find(r => r.name === row.name);
      const gid = user ? groupAssignments[user.id] : undefined;
      if (gid && grouped[gid] !== undefined) grouped[gid].push(row);
      else unassigned.push(row);
    });

    // 全形數字對齊：用全形數字 ０-９ + 全形空格補位，與中文字等寬
    const toFW = (n: number, w: number) =>
      String(n)
        .padStart(w)
        .replace(/ /g, '\u3000')                           // 全形空格
        .replace(/\d/g, d => String.fromCharCode(d.charCodeAt(0) + 0xFEE0)); // 半形→全形

    // 動態計算每欄最大寬度
    const allRows = [...Object.values(grouped).flat(), ...unassigned];
    const wOnsite = allRows.length ? Math.max(...allRows.map(r => String(Math.round(computeUnits(r, onsiteFieldKeys))).length)) : 3;
    const wRemote  = allRows.length ? Math.max(...allRows.map(r => String(Math.round(computeUnits(r, remoteFieldKeys))).length)) : 3;
    const wTotal   = allRows.length ? Math.max(...allRows.map(r => String(Math.round(computeTotalUnits(r))).length)) : 3;
    const wDays    = allRows.length ? Math.max(...allRows.map(r => String(r.workDays || 0).length)) : 2;

    const fmt = (row: any) => {
      const onsite = Math.round(computeUnits(row, onsiteFieldKeys));
      const remote = Math.round(computeUnits(row, remoteFieldKeys));
      const total = Math.round(computeTotalUnits(row));
      const name2 = row.name.slice(-2);
      return `${name2} ${toFW(row.workDays, wDays)}天    現${toFW(onsite, wOnsite)}    遠${toFW(remote, wRemote)}    總${toFW(total, wTotal)}`;
    };

    let text = header + '\n';
    groups.forEach(g => {
      let rows = grouped[g.id];
      if (!rows?.length) return;
      text += `\n${g.name}\n`;
      if (!sortField) {
        rows = [...rows].sort((a, b) => computeTotalUnits(b) - computeTotalUnits(a));
      }
      rows.forEach(r => { text += fmt(r) + '\n'; });
    });
    if (unassigned.length) {
      text += `\n(未分類)\n`;
      let rows = unassigned;
      if (!sortField) {
        rows = [...rows].sort((a, b) => computeTotalUnits(b) - computeTotalUnits(a));
      }
      rows.forEach(r => { text += fmt(r) + '\n'; });
    }
    return text.trim();
  }, [displayData, groups, groupAssignments, generalDates, currentMonth, cycles, radiographers, weights, sortField]);

  const handleLineCopy = () => {
    navigator.clipboard.writeText(lineText);
    setLineCopied(true);
    setTimeout(() => setLineCopied(false), 2500);
  };

  const handleSaveWeights = async () => {
    setIsSavingWeights(true);
    try {
      db.settings.radiographerWorkloadWeights = { ...weights };
      await db.saveSettings();
      alert("💾 權重已儲存！");
    } catch (e) {
      console.error("Failed to save workload weights", e);
      alert("儲存權重失敗，請稍後再試。");
    } finally {
      setIsSavingWeights(false);
    }
  };

  const totalUnitsSum = workloadData.reduce(
    (sum, row) => sum + (row.totalUnits || 0),
    0,
  );

  const onSiteUnitsSum = workloadData.reduce(
    (sum, row) => sum + (row.onsiteUnits || 0),
    0,
  );

  const remoteUnitsSum = workloadData.reduce(
    (sum, row) => sum + (row.remoteUnits || 0),
    0,
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const promises = Object.values(editingData).map((row) =>
        db.updateWorkload(row),
      );
      await Promise.all(promises);
      setIsEditing(false);
      alert("儲存成功！");
    } catch (e: any) {
      console.error("Save failed", e);
      const msg = e?.message || e?.error_description || JSON.stringify(e);
      alert(`儲存失敗：${msg}`);
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
          const values = Array.isArray(row.values) ? row.values : [];
          rows.push(values.slice(1)); // exceljs row.values[0] 是 undefined
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

      const targetName =
        workloadFieldMeta.find((field) => field.key === importTarget)?.label ||
        importTarget;

      setEditingData(newData);
      setIsEditing(true); // 自動開啟編輯模式讓使用者可以馬上儲存
      alert(
        `✅ 成功匯入 Excel！已對齊 ${matchCount} 位放射師的「${targetName}」量。請確認數據後按儲存。`,
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
        "輔控",
        "排班",
        "MR",
        "MR大男",
        "MR大女",
        "MR中",
        "MR小",
        "US",
        "腹",
        "乳",
        "心",
        "甲",
        "頸",
        "P女",
        "P男",
        "CT",
        "CTA",
        "CTA後處理",
        "DX",
        "MG",
        "BMD",
        "報告登打",
        "影像校對",
        "台積電報告",
        "現場加權",
        "遠班加權",
        "總加權",
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
          row.scheduler || 0,
          row.mr || 0,
          row.mrLargeMale || 0,
          row.mrLargeFemale || 0,
          row.mrMedium || 0,
          row.mrSmall || 0,
          row.us || 0,
          row.usA || 0,
          row.usBreast || 0,
          row.usHeart || 0,
          (row.usThy || 0) + (row.usNeck || 0),  // 甲 = Thy + Neck
          row.usCCA || 0,  // 頸 = CCA
          row.usPelvisFemale || 0,
          row.usPelvisMale || 0,
          row.ct || 0,
          row.cta || 0,
          row.ctaPostProcessing || 0,
          row.dx || 0,
          row.mg || 0,
          row.bmd || 0,
          row.reportTyping || 0,
          row.proofreader || 0,
          row.tsmcReport || 0,
          Number(computeUnits(row, onsiteFieldKeys).toFixed(1)),
          Number(computeUnits(row, remoteFieldKeys).toFixed(1)),
          Number(computeTotalUnits(row).toFixed(1)),
        ]);
      });

      // 設定欄寬
      worksheet.columns = [
        { width: 18 }, // 姓名
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 8 },
        { width: 20 }, // 天數與備註
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 8 },
        { width: 10 },
        { width: 10 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
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
                    onChange={(e) =>
                      setImportTarget(e.target.value as WorkloadFieldKey)
                    }
                    className="text-sm text-slate-700 bg-transparent py-1.5 outline-none font-bold"
                  >
                    {workloadFieldMeta.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
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
                <button
                  onClick={() => setShowGroupPanel(v => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors border shadow-sm ${
                    showGroupPanel
                      ? 'bg-violet-600 text-white border-violet-700'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Tag size={16} /> 分類
                </button>

              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div 
                className="cursor-pointer group flex items-center gap-2" 
                onClick={() => setShowWeights(!showWeights)}
              >
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 group-hover:bg-slate-200 text-slate-500 transition-colors">
                  {showWeights ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800">權重設定</div>
                  <div className="text-xs text-slate-500">
                    設定各類別的單位權重，儲存後會套用於總單位計算。
                  </div>
                </div>
              </div>
              {showWeights && (
                <button
                  onClick={handleSaveWeights}
                  disabled={isSavingWeights}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-white ${isSavingWeights ? "bg-slate-400" : "bg-emerald-600 hover:bg-emerald-700"}`}
                >
                  {isSavingWeights ? "儲存中..." : "儲存權重"}
                </button>
              )}
            </div>
            
            {showWeights && (
              <div className="grid gap-3 mt-4 pt-4 border-t border-slate-100 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 animate-in fade-in slide-in-from-top-2">
                {workloadFieldMeta.map((field) => (
                  <label key={field.key} className="block text-xs text-slate-600">
                    <div className="mb-1 font-medium text-slate-800">
                      {field.label}
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={weights[field.key]}
                      onChange={(e) =>
                        handleWeightChange(field.key, e.target.value)
                      }
                      className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-bold text-slate-800">現場加權</div>
              <div className="mt-2 text-3xl font-bold text-emerald-700">
                {Math.round(onSiteUnitsSum)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                其他檢查項目的加權總和。
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-bold text-slate-800">遠班加權</div>
              <div className="mt-2 text-3xl font-bold text-sky-700">
                {Math.round(remoteUnitsSum)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                報告登打與影像校對的加權總和。
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-bold text-slate-800">總加權</div>
              <div className="mt-2 text-3xl font-bold text-emerald-700">
                {Math.round(totalUnitsSum)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                現場與遠班加總的整體工作量。
              </div>
            </div>
          </div>
        </div>

        {/* Group Panel */}
        {showGroupPanel && (
          <div className="bg-white border border-violet-200 rounded-2xl p-4 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-violet-800 flex items-center gap-2"><Tag size={14}/> 分類管理</div>
              <button onClick={() => setShowGroupPanel(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                placeholder="輸入分類名稱（如：技術領導、儲備leader）..."
                className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400"
              />
              <button onClick={handleAddGroup} className="bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
                <Plus size={14}/> 新增
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {groups.length === 0 && <div className="text-xs text-slate-400 italic">尚未建立分類，新增後可在下方每人的下拉選單中指定</div>}
              {groups.map((g, idx) => (
                <div key={g.id} className="flex items-center gap-1 bg-violet-50 border border-violet-200 pl-2 pr-1 py-1 rounded-lg">
                  {/* reorder */}
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => handleMoveGroup(g.id, 'up')}
                      disabled={idx === 0}
                      className="text-violet-400 hover:text-violet-700 disabled:opacity-20 leading-none p-0.5"
                    ><ChevronUp size={13}/></button>
                    <button
                      type="button"
                      onClick={() => handleMoveGroup(g.id, 'down')}
                      disabled={idx === groups.length - 1}
                      className="text-violet-400 hover:text-violet-700 disabled:opacity-20 leading-none p-0.5"
                    ><ChevronDown size={13}/></button>
                  </div>
                  <input
                    value={g.name}
                    onChange={e => handleRenameGroup(g.id, e.target.value)}
                    className="text-sm font-medium text-violet-800 bg-transparent border-none outline-none w-24"
                  />
                  <button onClick={() => handleDeleteGroup(g.id)} className="text-violet-200 hover:text-red-500 transition-colors">
                    <X size={13}/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                    放射師姓名
                  </th>
                  {showGroupPanel && groups.length > 0 && (
                    <th className="px-3 py-3 text-center text-violet-600 bg-violet-50/50 whitespace-nowrap">分類</th>
                  )}
                  {workloadFieldMeta.map((field) => 
                    renderSortTh(
                      field.key,
                      field.label,
                      `${getHeaderStyle(field.key)} ${shouldRenderCategorySeparator(field.key) ? 'border-r-2 border-slate-300' : ''}`
                    )
                  )}
                  {renderSortTh("onsiteUnits", "現場加權", "bg-slate-100 text-slate-700")}
                  {renderSortTh("remoteUnits", "遠班加權", "bg-slate-100 text-slate-700")}
                  {renderSortTh("totalUnits", "總加權", "bg-slate-100 text-slate-700")}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={workloadFieldMeta.length + (showGroupPanel ? 4 : 3)}
                      className="px-4 py-8 text-center text-slate-400 font-medium"
                    >
                      無資料
                    </td>
                  </tr>
                ) : (
                  displayData.map((row: any, idx) => {
                      const user = radiographers.find(r => r.name === row.name);
                      const assignedGroupId = user ? (groupAssignments[user.id] || '') : '';
                      const assignedGroup = groups.find(g => g.id === assignedGroupId);
                      return (
                      <tr
                        key={row.name}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-bold text-slate-800 sticky left-0 bg-white border-r border-slate-100">
                          {row.name}
                        </td>
                        {showGroupPanel && groups.length > 0 && (
                          <td className="px-2 py-2.5 text-center">
                            <select
                              value={assignedGroupId}
                              onChange={e => user && handleAssignGroup(user.id, e.target.value)}
                              className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-700 outline-none focus:ring-1 focus:ring-violet-400 max-w-[80px]"
                            >
                              <option value="">－</option>
                              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          </td>
                        )}
                        {workloadFieldMeta.map((field) => {
                          const isScheduleField =
                            scheduleDerivedFieldKeys.includes(field.key);
                          return (
                            <td
                              key={field.key}
                              className={`px-4 py-2.5 text-center font-medium ${field.key === "cta" || field.key === "ctaPostProcessing" ? "bg-teal-50/10 text-teal-600 font-bold" : field.key === "reportTyping" ? "bg-indigo-50/10 text-indigo-600 font-bold" : field.key === "proofreader" ? "bg-purple-50/10 text-purple-600 font-bold" : "text-slate-700"} ${shouldRenderCategorySeparator(field.key) ? "border-r-2 border-slate-300" : ""}`}
                            >
                              {isEditing && !isScheduleField ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={row[field.key]}
                                  onChange={(e) =>
                                    handleInputChange(
                                      row.name,
                                      field.key,
                                      e.target.value,
                                    )
                                  }
                                  className="w-16 text-center border border-emerald-200 rounded px-1 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-emerald-50/50"
                                />
                              ) : (
                                field.key === "usThy"
                                  ? (() => { const v = (row.usThy || 0) + (row.usNeck || 0); return v ? (+v).toFixed(1) : "-"; })()
                                  : scheduleDerivedFieldKeys.includes(field.key)
                                  ? (row[field.key] || "-")
                                  : (() => { const v = row[field.key]; return v ? (+v).toFixed(1) : "-"; })()
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2.5 text-center font-bold text-slate-800 bg-slate-50">
                          {Math.round(computeUnits(row, onsiteFieldKeys))}
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-slate-800 bg-slate-50">
                          {Math.round(computeUnits(row, remoteFieldKeys))}
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-slate-800 bg-slate-50">
                          {Math.round(computeTotalUnits(row))}
                        </td>
                      </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* LINE Preview */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <MessageSquare size={15} className="text-green-600"/>
              LINE 複製預覽
            </div>
            <button
              onClick={handleLineCopy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                lineCopied ? 'bg-green-600 text-white' : 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'
              }`}
            >
              {lineCopied ? <><Check size={14}/> 已複製！</> : <><MessageSquare size={14}/> 複製到剪貼簿</>}
            </button>
          </div>
          <pre className="p-4 text-sm font-mono text-slate-700 whitespace-pre-wrap leading-relaxed bg-white">{lineText}</pre>
        </div>
      </div>
    </div>
  );
};

export default RadiographerWorkloadPage;
