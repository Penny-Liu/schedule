import React, { useState, useMemo, useEffect } from "react";
import {
  User,
  StationDefault,
  SPECIAL_ROLES,
  RadiographerDailyWorkload,
} from "../types";
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
  Info,
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
  | "tsmcReport"
  | "mrTeaching"
  | "mrLargeMaleTeaching"
  | "mrLargeFemaleTeaching"
  | "mrMediumTeaching"
  | "mrSmallTeaching"
  | "usTeaching"
  | "usATeaching"
  | "usBreastTeaching"
  | "usHeartTeaching"
  | "usThyTeaching"
  | "usCCATeaching"
  | "usNeckTeaching"
  | "usPelvisFemaleTeaching"
  | "usPelvisMaleTeaching"
  | "ctTeaching"
  | "dxTeaching"
  | "mgTeaching"
  | "bmdTeaching"
  | "ctaTeaching"
  | "floorControlOrders"
  | "floorControlPercentage";

const workloadFieldMeta: { key: WorkloadFieldKey; label: string }[] = [
  { key: "workDays", label: "上班天數" },
  { key: "floorControl", label: "場控(天)" },
  { key: "floorControlOrders", label: "場控醫令" },
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
  { key: "usCCA", label: "頸動脈" },
  { key: "usNeck", label: "頸部" },
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
  { key: "mrTeaching", label: "MR教學" },
  { key: "mrLargeMaleTeaching", label: "MR大男教學" },
  { key: "mrLargeFemaleTeaching", label: "MR大女教學" },
  { key: "mrMediumTeaching", label: "MR中教學" },
  { key: "mrSmallTeaching", label: "MR小教學" },
  { key: "usTeaching", label: "US教學" },
  { key: "usATeaching", label: "腹教學" },
  { key: "usBreastTeaching", label: "乳教學" },
  { key: "usHeartTeaching", label: "心教學" },
  { key: "usThyTeaching", label: "甲教學" },
  { key: "usCCATeaching", label: "頸教學" },
  { key: "usNeckTeaching", label: "頸部教學" },
  { key: "usPelvisFemaleTeaching", label: "P女教學" },
  { key: "usPelvisMaleTeaching", label: "P男教學" },
  { key: "ctTeaching", label: "CT教學" },
  { key: "dxTeaching", label: "DX教學" },
  { key: "mgTeaching", label: "MG教學" },
  { key: "bmdTeaching", label: "BMD教學" },
  { key: "ctaTeaching", label: "CTA教學" },
  { key: "floorControlPercentage", label: "場控加權比例 (%)" },
];

const defaultWorkloadWeights: Record<WorkloadFieldKey, number> = {
  workDays: 0,
  floorControl: 1,
  floorControlOrders: 0,
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
  mrTeaching: 1,
  mrLargeMaleTeaching: 1,
  mrLargeFemaleTeaching: 1,
  mrMediumTeaching: 1,
  mrSmallTeaching: 1,
  usTeaching: 1,
  usATeaching: 1,
  usBreastTeaching: 1,
  usHeartTeaching: 1,
  usThyTeaching: 1,
  usCCATeaching: 1,
  usNeckTeaching: 1,
  usPelvisFemaleTeaching: 1,
  usPelvisMaleTeaching: 1,
  ctTeaching: 1,
  dxTeaching: 1,
  mgTeaching: 1,
  bmdTeaching: 1,
  ctaTeaching: 1,
  floorControlPercentage: 12,
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

  useEffect(() => {
    const [y, m] = currentMonth.split("-").map(Number);
    db.loadDataForMonth(y, m);
  }, [currentMonth]);

  const [radiographers, setRadiographers] = useState<User[]>([]);
  const cycles = db.getCycles();
  const shifts = db.getShifts("", "");
  const cloudSchedule = db.getCloudScheduleEntries();
  const doctorShifts = db.doctorShifts;
  const workloads = db.workloads;

  const [isEditing, setIsEditing] = useState(false);
  const [estimationStartDate, setEstimationStartDate] = useState<string>("");
  const [includeEstimation, setIncludeEstimation] = useState<boolean>(true);
  const [editingData, setEditingData] = useState<Record<string, any>>({});
  const [lineExportMode, setLineExportMode] = useState<
    "ALL" | "ONSITE" | "REMOTE" | "TOTAL" | "TOTAL_AVG"
  >("ALL");
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
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Groups / classification
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>(
    () => (db.settings as any).radiographerGroups || [],
  );
  const [groupAssignments, setGroupAssignments] = useState<
    Record<string, string>
  >(() => (db.settings as any).radiographerGroupAssignments || {});
  const [newGroupName, setNewGroupName] = useState("");

  // LINE copy feedback
  const [lineCopied, setLineCopied] = useState(false);
  const [lineExcludedNames, setLineExcludedNames] = useState<string[]>([]);
  const [hasInitializedLineExcluded, setHasInitializedLineExcluded] =
    useState(false);
  const [showLearningPointAllocation, setShowLearningPointAllocation] =
    useState(false);

  // 用來儲存「單日篩選」的狀態
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [cycleDailyData, setCycleDailyData] = useState<any[]>([]);

  useEffect(() => {
    if (!hasInitializedLineExcluded && radiographers.length > 0) {
      // 預設將劉雅萍與放射師助理排除
      const assistants = radiographers
        .filter((r) => r.role === "RADIOGRAPHER_ASSISTANT")
        .map((r) => r.name);

      setLineExcludedNames(["劉雅萍", ...assistants]);
      setHasInitializedLineExcluded(true);
    }
  }, [radiographers, hasInitializedLineExcluded]);

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
    "mrTeaching",
    "mrLargeMaleTeaching",
    "mrLargeFemaleTeaching",
    "mrMediumTeaching",
    "mrSmallTeaching",
    "usTeaching",
    "usATeaching",
    "usBreastTeaching",
    "usHeartTeaching",
    "usThyTeaching",
    "usCCATeaching",
    "usNeckTeaching",
    "usPelvisFemaleTeaching",
    "usPelvisMaleTeaching",
    "ctTeaching",
    "dxTeaching",
    "mgTeaching",
    "bmdTeaching",
    "ctaTeaching",
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

  const remoteFieldKeys: WorkloadFieldKey[] = [
    "reportTyping",
    "proofreader",
    "tsmcReport",
  ];

  const computeUnits = (row: any, keys: WorkloadFieldKey[]) =>
    keys.reduce((sum, field) => {
      if (field === "floorControlOrders" || field === "floorControlPercentage")
        return sum;
      if (field === "floorControl") {
        return sum + (row.floorControlScore || 0);
      }

      let weight = (weights as any)[field];
      if (field.endsWith("Teaching") && weight === undefined) {
        // 如果沒有獨立設定教學權重，則 fallback 到一般權重
        weight = (weights as any)[field.replace("Teaching", "")] || 0;
      }

      return sum + ((row as any)[field] || 0) * (weight || 0);
    }, 0);

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

    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear--;
    }

    let reportStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-26`;
    let reportEnd = `${year}-${String(month).padStart(2, "0")}-25`;

    if (targetCycle) {
      firstDay = targetCycle.startDate;
      lastDay = targetCycle.endDate;

      const rs = new Date(firstDay);
      rs.setDate(rs.getDate() - 5);
      const re = new Date(lastDay);
      re.setDate(re.getDate() - 5);

      reportStart = `${rs.getFullYear()}-${String(rs.getMonth() + 1).padStart(2, "0")}-${String(rs.getDate()).padStart(2, "0")}`;
      reportEnd = `${re.getFullYear()}-${String(re.getMonth() + 1).padStart(2, "0")}-${String(re.getDate()).padStart(2, "0")}`;
    }

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

  // 取得該週期的每日明細資料 (以支援單日切換)
  useEffect(() => {
    if (generalDates.length > 0) {
      const startDate = generalDates[0];
      const endDate = generalDates[generalDates.length - 1];
      db.fetchDailyWorkloadsByRange(startDate, endDate)
        .then((data) => setCycleDailyData(data))
        .catch(console.error);
    }
  }, [generalDates]);

  useEffect(() => {
    const refreshData = () => {
      setRadiographers(
        db
          .getUsers()
          .filter(
            (u) =>
              u.isRadiographer === true &&
              !u.isPartTime &&
              (u.isActive !== false || hasWorkedInRange(u, generalDates)) &&
              (!generalDates.some((date) => isUserOnEmploymentPause(u, date)) ||
                hasWorkedInRange(u, generalDates)),
          ),
      );
    };
    refreshData();
    return db.subscribe(refreshData);
  }, [generalDates, shifts]);

  const workloadData = useMemo(() => {
    // 1. 自動分配教學點數：根據學生的排班與老師的搭班情況，按比例把學生的業績分配給指導老師
    const teachingAllocations: Record<string, Record<string, number>> = {};
    const learningDates: Record<string, Record<string, Set<string>>> = {};
    const teachingDates: Record<string, Record<string, Set<string>>> = {};

    const isLearningCat = (user: any, cat: string, shiftDate: string) => {
      const allCaps = [
        ...(user.learningCapabilities || []),
        ...(user.capabilities || []),
      ];
      if (allCaps.length === 0) return false;

      let matches = [];
      if (cat === "超音波")
        matches = allCaps.filter(
          (c: string) => c && (c.startsWith("US") || c === "超音波"),
        );
      else if (cat === "MR")
        matches = allCaps.filter((c: string) => c && c.startsWith("MR"));
      else if (cat === "CT")
        matches = allCaps.filter((c: string) => c && c.startsWith("CT"));
      else matches = allCaps.filter((c: string) => c && c.includes(cat));

      return matches.some((cap: string) => {
        const isExplicitLearning = user.learningCapabilities?.includes(cap);
        const schedDate = user.learningSchedules?.[cap];

        if (isExplicitLearning) {
          return !schedDate || shiftDate <= schedDate;
        } else {
          // 在獨立作業中，但如果系統留有畢業日期紀錄，且班表日期在該日期之前，則視為歷史學習！
          return schedDate && shiftDate <= schedDate;
        }
      });
    };

    const isStationCat = (station: string, cat: string) => {
      if (!station) return false;
      if (cat === "超音波")
        return station.startsWith("US") || station.includes("超音波");
      if (cat === "MR") return station.startsWith("MR");
      if (cat === "CT") return station.startsWith("CT");
      return station.includes(cat);
    };

    radiographers.forEach((student) => {
      const studentShifts = shifts.filter(
        (s) =>
          s.userId === student.id &&
          generalDates.includes(s.date) &&
          (!estimationStartDate || s.date <= estimationStartDate) &&
          s.station !== StationDefault.UNASSIGNED &&
          s.station !== StationDefault.OFF &&
          s.station !== "休假",
      );

      const studentWorkloads = workloads.filter(
        (w) => w.radiographerName === student.name && w.date === currentMonth,
      );
      const sw = studentWorkloads.length > 0 ? studentWorkloads[0] : null;

      const stationCategories = ["MR", "CT", "超音波", "DX", "MG", "BMD"];

      stationCategories.forEach((cat) => {
        const processedDates = new Set<string>();

        studentShifts.forEach((shift) => {
          if (isStationCat(shift.station, cat)) {
            if (processedDates.has(shift.date)) return;
            processedDates.add(shift.date);

            const isLearning = isLearningCat(student, cat, shift.date);

            if (isLearning) {
              if (!selectedDate || shift.date === selectedDate) {
                if (!learningDates[student.id]) learningDates[student.id] = {};
                if (!learningDates[student.id][cat])
                  learningDates[student.id][cat] = new Set();
                learningDates[student.id][cat].add(shift.date);
              }

              const studentStations = studentShifts
                .filter(
                  (s) => s.date === shift.date && isStationCat(s.station, cat),
                )
                .map((s) => s.station);

              const teachersOnSameDay = radiographers.filter((r) => {
                if (r.id === student.id) return false;
                const teacherShiftsForDate = shifts.filter(
                  (s) => s.userId === r.id && s.date === shift.date,
                );
                if (teacherShiftsForDate.length === 0) return false;

                // 老師必須跟學生在至少一個「完全相同」的崗位上
                const hasMatchingStation = teacherShiftsForDate.some((ts) =>
                  studentStations.includes(ts.station),
                );
                if (!hasMatchingStation) return false;

                const teacherIsLearning = isLearningCat(r, cat, shift.date);
                return !teacherIsLearning;
              });

              if (teachersOnSameDay.length > 0) {
                const weightPerTeacher = 1 / teachersOnSameDay.length;

                // 從 cycleDailyData 中抓取該名學生「這一天」實際產出的工作量
                const dData = cycleDailyData.find(
                  (d) =>
                    d.radiographerName === student.name &&
                    d.date === shift.date,
                );

                let fields: string[] = [];
                if (cat === "MR")
                  fields = [
                    "mr",
                    "mrLargeMale",
                    "mrLargeFemale",
                    "mrMedium",
                    "mrSmall",
                  ];
                else if (cat === "CT")
                  fields = ["ct", "cta", "ctaPostProcessing"];
                else if (cat === "超音波")
                  fields = [
                    "us",
                    "usA",
                    "usBreast",
                    "usHeart",
                    "usThy",
                    "usCCA",
                    "usNeck",
                    "usPelvisFemale",
                    "usPelvisMale",
                  ];
                else if (cat === "DX") fields = ["dx"];
                else if (cat === "MG") fields = ["mg"];
                else if (cat === "BMD") fields = ["bmd"];

                teachersOnSameDay.forEach((t) => {
                  if (!selectedDate || shift.date === selectedDate) {
                    if (!teachingDates[t.id]) teachingDates[t.id] = {};
                    if (!teachingDates[t.id][cat])
                      teachingDates[t.id][cat] = new Set();
                    teachingDates[t.id][cat].add(shift.date);

                    fields.forEach((field) => {
                      const getVal = (w: any, k: string) => {
                        if (!w) return 0;
                        return (
                          w[k] ||
                          w[
                            k.replace(
                              /[A-Z]/g,
                              (letter: string) => `_${letter.toLowerCase()}`,
                            )
                          ] ||
                          0
                        );
                      };

                      const actualPoints = getVal(dData, field);
                      if (actualPoints > 0) {
                        if (
                          student.name === "張庭榕" &&
                          field === "usPelvisMale"
                        ) {
                          console.log("TEACHING DEBUG:", {
                            date: shift.date,
                            student: student.name,
                            teacher: t.name,
                            field,
                            actualPoints,
                            weightPerTeacher,
                            assignedVal: actualPoints * weightPerTeacher,
                          });
                        }
                        const assignedVal = actualPoints * weightPerTeacher;
                        const teachingFieldKey = `${field}Teaching`;

                        if (!teachingAllocations[t.id])
                          teachingAllocations[t.id] = {};
                        teachingAllocations[t.id][teachingFieldKey] =
                          (teachingAllocations[t.id][teachingFieldKey] || 0) +
                          assignedVal;
                      }
                    });
                  }
                });
              }
            }
          }
        });
      });
    });

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
        estFloorControl: 0,
        estFloorControlOrders: 0,
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
        mrTeaching: 0,
        mrLargeMaleTeaching: 0,
        mrLargeFemaleTeaching: 0,
        mrMediumTeaching: 0,
        mrSmallTeaching: 0,
        usTeaching: 0,
        usATeaching: 0,
        usBreastTeaching: 0,
        usHeartTeaching: 0,
        usThyTeaching: 0,
        usCCATeaching: 0,
        usNeckTeaching: 0,
        usPelvisFemaleTeaching: 0,
        usPelvisMaleTeaching: 0,
        ctTeaching: 0,
        dxTeaching: 0,
        mgTeaching: 0,
        bmdTeaching: 0,
        ctaTeaching: 0,
      };

      const userWorkloads = workloads.filter(
        (w) => w.radiographerName === user.name && w.date === currentMonth,
      );

      let wToUse: any = {
        ...(userWorkloads.length > 0 ? userWorkloads[0] : {}),
      };
      if (selectedDate) {
        const dData = cycleDailyData.find(
          (d) => d.radiographerName === user.name && d.date === selectedDate,
        );
        if (dData) {
          wToUse = { ...wToUse, ...dData };
        } else {
          // Zero out daily count fields if no data for this day
          [
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
            "ct",
            "cta",
            "ctaPostProcessing",
            "dx",
            "mg",
            "bmd",
            "reportEntry",
            "reportTyping",
            "imageProofing",
            "proofreader",
            "tsmcReport",
            "tsmc_report",
          ].forEach((k) => {
            wToUse[k] = 0;
          });
        }
      }

      if (userWorkloads.length > 0) {
        stats.id = userWorkloads[0].id;
        const w = wToUse;
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
        stats.ctaPostProcessing +=
          w.ctaPostProcessing || w.cta_post_processing || 0;
        stats.reportTyping += w.reportEntry || w.reportTyping || 0;
        stats.proofreader += w.imageProofing || w.proofreader || 0;
        stats.tsmcReport += w.tsmcReport || w.tsmc_report || 0;
        stats.mrTeaching += Math.round(
          teachingAllocations[user.id]?.mrTeaching || 0,
        );
        stats.mrLargeMaleTeaching += Math.round(
          teachingAllocations[user.id]?.mrLargeMaleTeaching || 0,
        );
        stats.mrLargeFemaleTeaching += Math.round(
          teachingAllocations[user.id]?.mrLargeFemaleTeaching || 0,
        );
        stats.mrMediumTeaching += Math.round(
          teachingAllocations[user.id]?.mrMediumTeaching || 0,
        );
        stats.mrSmallTeaching += Math.round(
          teachingAllocations[user.id]?.mrSmallTeaching || 0,
        );
        stats.usTeaching += Math.round(
          teachingAllocations[user.id]?.usTeaching || 0,
        );
        stats.usATeaching += Math.round(
          teachingAllocations[user.id]?.usATeaching || 0,
        );
        stats.usBreastTeaching += Math.round(
          teachingAllocations[user.id]?.usBreastTeaching || 0,
        );
        stats.usHeartTeaching += Math.round(
          teachingAllocations[user.id]?.usHeartTeaching || 0,
        );
        stats.usThyTeaching += Math.round(
          teachingAllocations[user.id]?.usThyTeaching || 0,
        );
        stats.usCCATeaching += Math.round(
          teachingAllocations[user.id]?.usCCATeaching || 0,
        );
        stats.usNeckTeaching += Math.round(
          teachingAllocations[user.id]?.usNeckTeaching || 0,
        );
        stats.usPelvisFemaleTeaching += Math.round(
          teachingAllocations[user.id]?.usPelvisFemaleTeaching || 0,
        );
        stats.usPelvisMaleTeaching += Math.round(
          teachingAllocations[user.id]?.usPelvisMaleTeaching || 0,
        );
        stats.ctTeaching += Math.round(
          teachingAllocations[user.id]?.ctTeaching || 0,
        );
        stats.dxTeaching += Math.round(
          teachingAllocations[user.id]?.dxTeaching || 0,
        );
        stats.mgTeaching += Math.round(
          teachingAllocations[user.id]?.mgTeaching || 0,
        );
        stats.bmdTeaching += Math.round(
          teachingAllocations[user.id]?.bmdTeaching || 0,
        );
        stats.ctaTeaching += Math.round(
          teachingAllocations[user.id]?.ctaTeaching || 0,
        );
      } else {
        // 沒有直接業績，但可能有分配到的教學點數
        const teacherAlloc = teachingAllocations[user.id];
        if (teacherAlloc) {
          stats.mrTeaching += Math.round(teacherAlloc.mrTeaching || 0);
          stats.mrLargeMaleTeaching += Math.round(
            teacherAlloc.mrLargeMaleTeaching || 0,
          );
          stats.mrLargeFemaleTeaching += Math.round(
            teacherAlloc.mrLargeFemaleTeaching || 0,
          );
          stats.mrMediumTeaching += Math.round(
            teacherAlloc.mrMediumTeaching || 0,
          );
          stats.mrSmallTeaching += Math.round(
            teacherAlloc.mrSmallTeaching || 0,
          );
          stats.usTeaching += Math.round(teacherAlloc.usTeaching || 0);
          stats.usATeaching += Math.round(teacherAlloc.usATeaching || 0);
          stats.usBreastTeaching += Math.round(
            teacherAlloc.usBreastTeaching || 0,
          );
          stats.usHeartTeaching += Math.round(
            teacherAlloc.usHeartTeaching || 0,
          );
          stats.usThyTeaching += Math.round(teacherAlloc.usThyTeaching || 0);
          stats.usCCATeaching += Math.round(teacherAlloc.usCCATeaching || 0);
          stats.usNeckTeaching += Math.round(teacherAlloc.usNeckTeaching || 0);
          stats.usPelvisFemaleTeaching += Math.round(
            teacherAlloc.usPelvisFemaleTeaching || 0,
          );
          stats.usPelvisMaleTeaching += Math.round(
            teacherAlloc.usPelvisMaleTeaching || 0,
          );
          stats.ctTeaching += Math.round(teacherAlloc.ctTeaching || 0);
          stats.dxTeaching += Math.round(teacherAlloc.dxTeaching || 0);
          stats.mgTeaching += Math.round(teacherAlloc.mgTeaching || 0);
          stats.bmdTeaching += Math.round(teacherAlloc.bmdTeaching || 0);
          stats.ctaTeaching += Math.round(teacherAlloc.ctaTeaching || 0);
        }
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
      stats.workedDaysSoFar = userShiftsInRange.filter(
        (s) => !estimationStartDate || s.date <= estimationStartDate,
      ).length;

      let remoteDays = 0;
      let dazhiDays = 0;
      let beitouDays = 0;
      userShiftsInRange.forEach((s) => {
        if (s.station.includes("遠")) remoteDays++;
        else if (
          s.station.includes("大直") ||
          (s.location && s.location.includes("大直"))
        )
          dazhiDays++;
        else beitouDays++;
      });
      stats.remoteDays = remoteDays;
      stats.dazhiDays = dazhiDays;
      stats.beitouDays = beitouDays;
      stats.onSiteDays = stats.workDays - remoteDays;

      let offDays = 0;
      userDates.forEach((date) => {
        // [Modification]: Exclude dates before hireDate
        if (user.hireDate && date < user.hireDate) return;

        if (db.getUserStatusOnDate(user.id, date) === "OFF") {
          offDays++;
        }
      });
      stats.offDays = offDays;

      let memo = personalCycle?.memo || "";
      let coopLeave = "";
      if (generalDates.length > 0) {
        const coopDates: string[] = [];
        userShiftsInRange.forEach((s) => {
          if (s.specialRoles.includes("配合銷假")) {
            const d = new Date(s.date);
            coopDates.push(`${d.getMonth() + 1}/${d.getDate()}`);
          }
        });
        if (coopDates.length > 0) {
          coopLeave = coopDates.join(", ");
        }
        if (personalCycle && !memo) {
          memo = `${personalCycle.startDate.substring(5)} ~ ${personalCycle.endDate.substring(5)}`;
        }
      }
      stats.remarks = memo;
      stats.coopLeave = coopLeave;

      let floorControlScore = 0;
      let floorControlOrders = 0;
      let estFloorControl = 0;
      let estFloorControlOrders = 0;
      const allFloorControlShifts = userShiftsInRange.filter((s) =>
        s.station.includes("場控"),
      );
      const floorControlShifts = allFloorControlShifts.filter(
        (s) => !estimationStartDate || s.date <= estimationStartDate,
      );
      const futureFloorControlShifts = allFloorControlShifts.filter(
        (s) => estimationStartDate && s.date > estimationStartDate,
      );

      const floorControl = floorControlShifts.length;
      estFloorControl = futureFloorControlShifts.length;

      const pct = (weights.floorControlPercentage ?? 12) / 100;
      floorControlShifts.forEach((s) => {
        const dStats = (db.settings as any).dailyStats?.[s.date];
        if (dStats && typeof dStats.total_weighted_orders === "number") {
          floorControlScore += Math.round(dStats.total_weighted_orders * pct);
          floorControlOrders += dStats.total_weighted_orders;
        } else {
          // Fallback to fixed 30 if no daily stats exist for that day
          floorControlScore += 30;
          floorControlOrders += Math.round(30 / pct); // 逆推顯示的總醫令
        }
      });

      futureFloorControlShifts.forEach((s) => {
        const dStats = (db.settings as any).dailyStats?.[s.date];
        if (dStats && typeof dStats.total_weighted_orders === "number") {
          estFloorControlOrders += dStats.total_weighted_orders;
        } else {
          estFloorControlOrders += Math.round(30 / pct);
        }
      });

      const assist = userShiftsInRange.filter(
        (s) =>
          (s.specialRoles.includes(SPECIAL_ROLES.ASSIST) ||
            s.station.includes("輔控") ||
            s.station === "輔") &&
          (!estimationStartDate || s.date <= estimationStartDate),
      ).length;
      const scheduler = userShiftsInRange.filter(
        (s) =>
          (s.specialRoles.includes(SPECIAL_ROLES.SCHEDULER) ||
            s.station.includes("排班")) &&
          (!estimationStartDate || s.date <= estimationStartDate),
      ).length;
      stats.floorControl = floorControl;
      stats.estFloorControl = estFloorControl;
      stats.floorControlScore = floorControlScore;
      stats.floorControlOrders = floorControlOrders;
      stats.estFloorControlOrders = estFloorControlOrders;
      stats.assist = assist;
      stats.scheduler = scheduler;

      let estOnsiteUnits = 0;
      let estRemoteUnits = 0;
      if (estimationStartDate) {
        const futureShifts = shifts.filter(
          (s) =>
            s.userId === user.id &&
            generalDates.includes(s.date) &&
            s.date > estimationStartDate &&
            s.station !== StationDefault.UNASSIGNED &&
            s.station !== StationDefault.OFF &&
            s.station !== "休假",
        );

        const shiftsByDate: Record<string, any[]> = {};
        futureShifts.forEach((s) => {
          if (!shiftsByDate[s.date]) shiftsByDate[s.date] = [];
          shiftsByDate[s.date].push(s);
        });

        const estDatesAdded: string[] = [];
        Object.entries(shiftsByDate).forEach(([date, dayShifts]) => {
          const isRemote = dayShifts.some((s) => s.station.includes("遠"));
          if (isRemote) estRemoteUnits += 30;
          else estOnsiteUnits += 30;
          estDatesAdded.push(date);
        });

        if (estDatesAdded.length > 0) {
          const dates = estDatesAdded.sort();
          const datesStr = dates
            .map(
              (d) =>
                parseInt(d.substring(5, 7)) +
                "/" +
                parseInt(d.substring(8, 10)),
            )
            .join("、");
          const estStr = `${datesStr}預估`;
          stats.estRemark = estStr;
        }
      }
      stats.estOnsiteUnits = estOnsiteUnits;
      stats.estRemoteUnits = estRemoteUnits;

      stats.onsiteUnits =
        computeUnits(stats, onsiteFieldKeys) +
        (includeEstimation ? estOnsiteUnits : 0);
      stats.remoteUnits =
        computeUnits(stats, remoteFieldKeys) +
        (includeEstimation ? estRemoteUnits : 0);
      stats.totalUnits =
        computeTotalUnits(stats) +
        (includeEstimation ? estOnsiteUnits + estRemoteUnits : 0);

      stats.learningDates = learningDates[user.id] || {};
      stats.teachingDates = teachingDates[user.id] || {};

      return stats;
    });
  }, [
    radiographers,
    workloads,
    currentMonth,
    weights,
    generalDates,
    shifts,
    estimationStartDate,
    includeEstimation,
  ]);

  // Sorted display data (must be after workloadData)
  const displayData = useMemo(() => {
    const base: any[] = isEditing ? Object.values(editingData) : workloadData;
    if (!sortField) return base;
    return [...base].sort((a, b) => {
      let va: number, vb: number;
      if (sortField === "onsiteUnits") {
        va =
          computeUnits(a, onsiteFieldKeys) +
          (includeEstimation ? a.estOnsiteUnits || 0 : 0);
        vb =
          computeUnits(b, onsiteFieldKeys) +
          (includeEstimation ? b.estOnsiteUnits || 0 : 0);
      } else if (sortField === "remoteUnits") {
        va =
          computeUnits(a, remoteFieldKeys) +
          (includeEstimation ? a.estRemoteUnits || 0 : 0);
        vb =
          computeUnits(b, remoteFieldKeys) +
          (includeEstimation ? b.estRemoteUnits || 0 : 0);
      } else if (sortField === "totalUnits") {
        va =
          computeTotalUnits(a) +
          (includeEstimation
            ? (a.estOnsiteUnits || 0) + (a.estRemoteUnits || 0)
            : 0);
        vb =
          computeTotalUnits(b) +
          (includeEstimation
            ? (b.estOnsiteUnits || 0) + (b.estRemoteUnits || 0)
            : 0);
      } else if (sortField === "dailyAvg") {
        const ta =
          computeTotalUnits(a) +
          (includeEstimation
            ? (a.estOnsiteUnits || 0) + (a.estRemoteUnits || 0)
            : 0);
        const tb =
          computeTotalUnits(b) +
          (includeEstimation
            ? (b.estOnsiteUnits || 0) + (b.estRemoteUnits || 0)
            : 0);
        const aDays =
          !includeEstimation && estimationStartDate
            ? a.workedDaysSoFar
            : a.workDays;
        const bDays =
          !includeEstimation && estimationStartDate
            ? b.workedDaysSoFar
            : b.workDays;
        va = aDays > 0 ? ta / aDays : 0;
        vb = bDays > 0 ? tb / bDays : 0;
      } else {
        va = Number(a[sortField]) || 0;
        vb = Number(b[sortField]) || 0;
      }
      const numA = Number(va) || 0;
      const numB = Number(vb) || 0;
      if (numA !== numB) return sortDir === "asc" ? numA - numB : numB - numA;
      return a.name.localeCompare(b.name);
    });
  }, [workloadData, editingData, isEditing, sortField, sortDir, weights]);

  const renderSortTh = (field: string, label: string, className = "") => {
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
          {active ? (
            sortDir === "asc" ? (
              <ChevronUp size={11} />
            ) : (
              <ChevronDown size={11} />
            )
          ) : (
            <ChevronsUpDown size={11} className="opacity-30" />
          )}
        </span>
      </th>
    );
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === "desc") setSortDir("asc");
      else setSortField(null);
    } else {
      setSortField(field);
      setSortDir("desc");
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
  const persistGroups = async (
    g: typeof groups,
    a: typeof groupAssignments,
  ) => {
    (db.settings as any).radiographerGroups = g;
    (db.settings as any).radiographerGroupAssignments = a;
    await db.saveSettings();
  };

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    const updated = [
      ...groups,
      { id: generateUUID(), name: newGroupName.trim() },
    ];
    setGroups(updated);
    setNewGroupName("");
    await persistGroups(updated, groupAssignments);
  };

  const handleDeleteGroup = async (id: string) => {
    const updated = groups.filter((g) => g.id !== id);
    const newA = { ...groupAssignments };
    Object.keys(newA).forEach((uid) => {
      if (newA[uid] === id) delete newA[uid];
    });
    setGroups(updated);
    setGroupAssignments(newA);
    await persistGroups(updated, newA);
  };

  const handleRenameGroup = async (id: string, name: string) => {
    const updated = groups.map((g) => (g.id === id ? { ...g, name } : g));
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

  const handleMoveGroup = (id: string, dir: "up" | "down") => {
    setGroups((prev) => {
      const idx = prev.findIndex((g) => g.id === id);
      if (idx < 0) return prev;
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
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
    const startDate = generalDates[0] || "";
    const endDate = generalDates[generalDates.length - 1] || "";
    const days = generalDates.length;
    const [y, m] = currentMonth.split("-").map(Number);
    const cycle = cycles.find(
      (c) =>
        c.name === `${y}/${String(m).padStart(2, "0")}` ||
        c.name === `${y}/${m}`,
    );
    const mm = String(m).padStart(2, "0");
    let header = `${y}第${mm}週期 \n（${startDate.slice(5).replace("-", "/")}~${endDate.slice(5).replace("-", "/")}）  ${days}天`;
    if (!includeEstimation && estimationStartDate) {
      header += `\n（統計至: ${estimationStartDate.slice(5).replace("-", "/")}）`;
    }

    const grouped: Record<string, any[]> = {};
    const unassigned: any[] = [];
    groups.forEach((g) => {
      grouped[g.id] = [];
    });
    displayData.forEach((row) => {
      const user = radiographers.find((r) => r.name === row.name);
      const gid = user ? groupAssignments[user.id] : undefined;
      if (gid && grouped[gid] !== undefined) grouped[gid].push(row);
      else unassigned.push(row);
    });

    const allRows = [...Object.values(grouped).flat(), ...unassigned];
    const wOnsite = allRows.length
      ? Math.max(
          ...allRows.map(
            (r) =>
              String(
                Math.round(
                  computeUnits(r, onsiteFieldKeys) +
                    (includeEstimation ? r.estOnsiteUnits || 0 : 0),
                ),
              ).length,
          ),
        )
      : 3;
    const wRemote = allRows.length
      ? Math.max(
          ...allRows.map(
            (r) =>
              String(
                Math.round(
                  computeUnits(r, remoteFieldKeys) +
                    (includeEstimation ? r.estRemoteUnits || 0 : 0),
                ),
              ).length,
          ),
        )
      : 3;
    const wTotal = allRows.length
      ? Math.max(
          ...allRows.map(
            (r) =>
              String(
                Math.round(
                  computeTotalUnits(r) +
                    (includeEstimation
                      ? (r.estOnsiteUnits || 0) + (r.estRemoteUnits || 0)
                      : 0),
                ),
              ).length,
          ),
        )
      : 3;
    const wDays = allRows.length
      ? Math.max(...allRows.map((r) => String(r.workDays || 0).length))
      : 2;

    const pad = (n: any, w: number) => String(n).padStart(w, " ");

    const fmt = (row: any) => {
      const onsite = Math.round(
        computeUnits(row, onsiteFieldKeys) +
          (includeEstimation ? row.estOnsiteUnits || 0 : 0),
      );
      const remote = Math.round(
        computeUnits(row, remoteFieldKeys) +
          (includeEstimation ? row.estRemoteUnits || 0 : 0),
      );
      const total = Math.round(
        computeTotalUnits(row) +
          (includeEstimation
            ? (row.estOnsiteUnits || 0) + (row.estRemoteUnits || 0)
            : 0),
      );
      const name2 = row.name.slice(-2);

      let firstLine = `${name2} ${pad(row.workDays, wDays)}天`;
      if (!includeEstimation && estimationStartDate) {
        firstLine += ` -已上${row.workedDaysSoFar}天`;
      }

      let secondLine = `  `;
      if (lineExportMode === "ALL" || lineExportMode === "ONSITE")
        secondLine += `現${pad(onsite, wOnsite)} `;
      if (lineExportMode === "ALL" || lineExportMode === "REMOTE")
        secondLine += `遠${pad(remote, wRemote)} `;
      if (lineExportMode === "ALL" || lineExportMode === "TOTAL")
        secondLine += `總${pad(total, wTotal)}`;
      if (lineExportMode === "TOTAL_AVG") {
        secondLine += `總${pad(total, wTotal)}`;
        const denom =
          !includeEstimation && estimationStartDate
            ? row.workedDaysSoFar
            : row.workDays;
        const avg = denom > 0 ? (total / denom).toFixed(1) : "0.0";
        secondLine += ` 均${pad(avg, 4)}`;
      }

      let estRmk =
        includeEstimation && row.estRemark ? `  (${row.estRemark})` : "";
      secondLine += estRmk;

      let result = `${firstLine}\n${secondLine}`;

      let tRmk = [];
      if (row.teachingDates && Object.keys(row.teachingDates).length > 0) {
        const parts = Object.entries(row.teachingDates).map(
          ([cat, dates]: any) => `${cat}${dates.size}天`,
        );
        tRmk.push(`教學：${parts.join("，")}`);
      }
      if (row.learningDates && Object.keys(row.learningDates).length > 0) {
        const parts = Object.entries(row.learningDates).map(
          ([cat, dates]: any) => `${cat}${dates.size}天`,
        );
        tRmk.push(`學習：${parts.join("，")}`);
      }
      if (tRmk.length > 0) {
        result += `\n  ${tRmk.join(" / ")}`;
      }

      if (row.remarks) {
        result += `\n（${row.remarks}）`;
      }

      return result;
    };

    let text = header + "\n";
    groups.forEach((g) => {
      let rows =
        grouped[g.id]?.filter((r) => !lineExcludedNames.includes(r.name)) || [];
      if (!rows.length) return;
      text += `\n${g.name}\n`;
      if (!sortField) {
        rows = [...rows].sort(
          (a, b) => computeTotalUnits(b) - computeTotalUnits(a),
        );
      }
      text += rows.map((r) => fmt(r)).join("\n\n") + "\n";
    });
    if (unassigned.length) {
      let rows = unassigned.filter((r) => !lineExcludedNames.includes(r.name));
      if (rows.length > 0) {
        text += `\n(未分類)\n`;
        if (!sortField) {
          rows = [...rows].sort(
            (a, b) => computeTotalUnits(b) - computeTotalUnits(a),
          );
        }
        text += rows.map((r) => fmt(r)).join("\n\n") + "\n";
      }
    }
    return text.trim();
  }, [
    displayData,
    groups,
    groupAssignments,
    generalDates,
    currentMonth,
    cycles,
    radiographers,
    weights,
    sortField,
    lineExportMode,
    lineExcludedNames,
  ]);

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

  const handleImportDailyExcel = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      let rows: any[][] = [];

      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];
        worksheet.eachRow((row) => {
          const values = Array.isArray(row.values) ? row.values : [];
          rows.push(values.slice(1));
        });
      } catch (err) {
        alert("無法讀取 Excel，請確認檔案格式是否正確 (.xlsx)");
        return;
      }

      if (rows.length < 2) return;

      const headers = rows[0].map((h) => String(h || "").trim());
      const dateIdx = headers.findIndex(
        (h) =>
          h === "日期" ||
          h === "Date" ||
          h.includes("Date") ||
          h.includes("日期"),
      );
      const nameIdx = headers.findIndex(
        (h) => h === "姓名" || h === "Name" || h === "放射師",
      );

      if (dateIdx === -1 || nameIdx === -1) {
        alert(
          `找不到「日期」或「姓名」欄位！這份 Excel 可能不是每日報表格式。\n檔案中的標題：\n${headers.join(", ")}`,
        );
        return;
      }

      // 欄位對應
      const fieldMap: Record<string, string> = {
        MR: "mr",
        "MR(大男)": "mrLargeMale",
        "MR(大女)": "mrLargeFemale",
        "MR(中)": "mrMedium",
        "MR(小)": "mrSmall",
        CT: "ct",
        超音波: "us",
        DX: "dx",
        MG: "mg",
        BMD: "bmd",
        CTA後處理: "ctaPostProcessing",
      };

      const colIndices: Record<string, number> = {};
      Object.keys(fieldMap).forEach((key) => {
        const idx = headers.findIndex(
          (h) => h === key || h === fieldMap[key] || h.includes(key),
        );
        if (idx !== -1) colIndices[fieldMap[key]] = idx;
      });

      const radiographerNames = Object.keys(
        workloadData.reduce(
          (acc, d) => ({ ...acc, [d.radiographerName]: 1 }),
          {},
        ),
      );

      const dailyRecords: Partial<RadiographerDailyWorkload>[] = [];

      // 無論是否已在編輯狀態，都以畫面上最新的資料作為基底
      const newData: Record<string, any> = {};
      workloadData.forEach((d) => {
        newData[d.radiographerName] = { ...d };
      });

      let parsedCount = 0;

      rows.slice(1).forEach((row) => {
        const dateStr = String(row[dateIdx] || "").trim();
        const nameStr = String(row[nameIdx] || "").trim();

        if (!dateStr || !nameStr || !radiographerNames.includes(nameStr))
          return;

        // Convert Excel date or text to YYYY-MM-DD
        let formattedDate = dateStr;
        const dObj = new Date(dateStr);
        if (!isNaN(dObj.getTime())) {
          formattedDate = dObj.toISOString().split("T")[0];
        } else {
          // Excel serial date to JS Date
          const serial = parseFloat(dateStr);
          if (!isNaN(serial)) {
            const jsDate = new Date(
              Math.round((serial - 25569) * 86400 * 1000),
            );
            formattedDate = jsDate.toISOString().split("T")[0];
          }
        }

        const record: Partial<RadiographerDailyWorkload> = {
          date: formattedDate,
          radiographerName: nameStr,
        };

        // Sum into monthly data
        if (!newData[nameStr]) newData[nameStr] = {};

        Object.keys(colIndices).forEach((field) => {
          const valStr = String(row[colIndices[field]] || "0").replace(
            /,/g,
            "",
          );
          const val = parseFloat(valStr) || 0;
          if (val > 0) {
            record[field as keyof RadiographerDailyWorkload] = val;
            // Aggregate
            newData[nameStr][field] = (newData[nameStr][field] || 0) + val;
          }
        });

        dailyRecords.push(record);
        parsedCount++;
      });

      if (parsedCount === 0) {
        alert("找不到任何有效的資料列！請確認人員名稱與系統相符。");
        return;
      }

      try {
        await db.saveDailyWorkloads(dailyRecords);
        setEditingData(newData);
        setIsEditing(true);
        alert(
          `✅ 成功匯入並儲存 ${parsedCount} 筆每日明細資料！\n\n畫面上的月總量已自動更新，請確認總量無誤後點擊「儲存」按鈕以更新本週期的月總量。`,
        );
      } catch (err) {
        alert("儲存每日明細失敗：" + err);
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
  };

  const handleExportDaily = async () => {
    try {
      const startDate = generalDates[0];
      const endDate = generalDates[generalDates.length - 1];
      if (!startDate || !endDate) return;

      const dailyData = await db.fetchDailyWorkloadsByRange(startDate, endDate);
      if (dailyData.length === 0) {
        alert(`這段期間 (${startDate} ~ ${endDate}) 沒有找到每日明細資料。`);
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("每日工作量明細");

      worksheet.columns = [
        { header: "日期", key: "date", width: 15 },
        { header: "姓名", key: "radiographerName", width: 15 },
        { header: "MR", key: "mr", width: 10 },
        { header: "MR(大男)", key: "mrLargeMale", width: 10 },
        { header: "MR(大女)", key: "mrLargeFemale", width: 10 },
        { header: "MR(中)", key: "mrMedium", width: 10 },
        { header: "MR(小)", key: "mrSmall", width: 10 },
        { header: "CT", key: "ct", width: 10 },
        { header: "超音波", key: "us", width: 10 },
        { header: "DX", key: "dx", width: 10 },
        { header: "MG", key: "mg", width: 10 },
        { header: "BMD", key: "bmd", width: 10 },
        { header: "CTA後處理", key: "ctaPostProcessing", width: 10 },
      ];

      // Sort by date, then name
      dailyData.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.radiographerName.localeCompare(b.radiographerName);
      });

      dailyData.forEach((d) => worksheet.addRow(d));

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `每日放射師工作量明細_${startDate}_${endDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      console.error("Export daily Excel failed", e);
      alert(`匯出每日 Excel 失敗: ${e.message}`);
    }
  };

  const handleExport = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("工作量統計");

      const assistants = radiographers
        .filter((r) => r.role === "RADIOGRAPHER_ASSISTANT")
        .map((r) => r.name);
      const excludedNames = ["劉雅萍", ...assistants];
      const filteredWorkloadData = workloadData.filter(
        (r) => !excludedNames.includes(r.name),
      );
      const filteredDisplayData = displayData.filter(
        (r) => !excludedNames.includes(r.name),
      );

      // 取得標題資訊
      const startDate = generalDates[0] || "";
      const endDate = generalDates[generalDates.length - 1] || "";
      const [y, m] = currentMonth.split("-").map(Number);
      const mm = String(m).padStart(2, "0");
      const cycleText = `第${m}週期`;
      const dateRangeText =
        startDate && endDate
          ? `${startDate.substring(5).replace("-", "/")}-${endDate.substring(5).replace("-", "/")}`
          : "";
      const titleText = `${y}年 ${mm}月放射師工作量統計（排班週期：${cycleText} (${dateRangeText})）`;

      // 1. 新增第一列 Title (合併 A 到 AK) 37 欄
      worksheet.mergeCells("A1:AK1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = titleText;
      titleCell.font = { size: 16, bold: true, name: "微軟正黑體" };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(1).height = 35;

      // 2. 準備第二與第三列 (合併欄位與子標題)
      worksheet.mergeCells("A2:A3");
      worksheet.getCell("A2").value = "姓名";

      worksheet.mergeCells("B2:I2");
      worksheet.getCell("B2").value = "上班天數";

      worksheet.mergeCells("J2:AC2");
      worksheet.getCell("J2").value = "現場工作量";

      worksheet.mergeCells("AD2:AF2");
      worksheet.getCell("AD2").value = "遠班工作量";

      worksheet.mergeCells("AG2:AG3");
      worksheet.getCell("AG2").value = "現場加權";

      worksheet.mergeCells("AH2:AH3");
      worksheet.getCell("AH2").value = "遠班加權";

      worksheet.mergeCells("AI2:AI3");
      worksheet.getCell("AI2").value = "總加權";

      worksheet.mergeCells("AJ2:AJ3");
      worksheet.getCell("AJ2").value = "教學與學習";

      worksheet.mergeCells("AK2:AK3");
      worksheet.getCell("AK2").value = "預估日期";

      // 欄位標題 (Row 3)
      const headersRow3 = [
        "", // A3 (merged)
        "上班天數",
        "現場天數",
        "遠班",
        "北投天數",
        "大直天數",
        "休假",
        "備註",
        "配合銷假",
        "場控",
        "輔控",
        "排班",
        "MR大男",
        "MR大女",
        "MR中",
        "MR小",
        "腹",
        "乳",
        "心",
        "甲",
        "頸動脈",
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
        "",
        "",
        "",
        "",
        "", // AG3, AH3, AI3, AJ3, AK3 (merged)
      ];
      worksheet.getRow(3).values = headersRow3;

      // 設定標題列樣式 (Row 2 & 3)
      [2, 3].forEach((r) => {
        const row = worksheet.getRow(r);
        row.height = r === 3 ? 35 : 25;
        for (let i = 1; i <= 37; i++) {
          const cell = row.getCell(i);
          cell.font = {
            bold: true,
            size: 12,
            name: "微軟正黑體",
            color: { argb: "FF333333" },
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: "center",
            wrapText: true,
          };

          // 區塊最後一欄使用粗線劃分
          const isBlockEnd = [
            1, 9, 12, 16, 23, 29, 32, 33, 35, 36, 37,
          ].includes(i);
          cell.border = {
            top: { style: "thin", color: { argb: "FFCCCCCC" } },
            left: { style: "thin", color: { argb: "FFCCCCCC" } },
            bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
            right: {
              style: isBlockEnd ? "medium" : "thin",
              color: { argb: isBlockEnd ? "FF888888" : "FFCCCCCC" },
            },
          };

          // 預設底色
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF2F2F2" },
          };
        }
      });

      // 覆寫第二列主標題與最後三欄加權顏色的底色
      worksheet.getCell("B2").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2EFDA" },
      }; // 淡綠色 - 上班天數
      worksheet.getCell("J2").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF2CC" },
      }; // 淡黃色 - 現場工作量
      worksheet.getCell("AD2").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDDEBF7" },
      }; // 淡藍色 - 遠班工作量

      // 覆寫最後三欄 (Row 2, AG, AH, AI) 的加權顏色
      worksheet.getCell("AG2").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF2CC" },
      }; // 現場加權 (黃色系)
      worksheet.getCell("AH2").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDDEBF7" },
      }; // 遠班加權 (藍色系)
      worksheet.getCell("AI2").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFCE4D6" },
      }; // 總加權 (橘色系)

      // 資料列
      filteredWorkloadData.forEach((row) => {
        let richTextValue: any = { richText: [] };
        if (row.teachingDates && Object.keys(row.teachingDates).length > 0) {
          const parts = Object.entries(row.teachingDates).map(
            ([cat, dates]: any) => `${cat}${dates.size}天`,
          );
          richTextValue.richText.push({
            text: `教學：${parts.join("，")}`,
            font: { color: { argb: "FFD32F2F" }, name: "微軟正黑體", size: 11 },
          });
        }
        if (row.learningDates && Object.keys(row.learningDates).length > 0) {
          const parts = Object.entries(row.learningDates).map(
            ([cat, dates]: any) => `${cat}${dates.size}天`,
          );
          if (richTextValue.richText.length > 0)
            richTextValue.richText.push({ text: "\n" });
          richTextValue.richText.push({
            text: `學習：${parts.join("，")}`,
            font: { color: { argb: "FF1976D2" }, name: "微軟正黑體", size: 11 },
          });
        }
        const teachingLearningRemark =
          richTextValue.richText.length > 0 ? richTextValue : "";

        const excelRow = worksheet.addRow([
          row.name,
          row.workDays || 0,
          row.onSiteDays || 0,
          row.remoteDays || 0,
          row.beitouDays || 0,
          row.dazhiDays || 0,
          row.offDays || 0,
          row.remarks || "",
          row.coopLeave || "",
          row.floorControl || 0,
          row.assist || 0,
          row.scheduler || 0,
          (row.mrLargeMale || 0) + ((row as any).mrLargeMaleTeaching || 0),
          (row.mrLargeFemale || 0) + ((row as any).mrLargeFemaleTeaching || 0),
          (row.mrMedium || 0) + ((row as any).mrMediumTeaching || 0),
          (row.mrSmall || 0) + ((row as any).mrSmallTeaching || 0),
          (row.usA || 0) + ((row as any).usATeaching || 0),
          (row.usBreast || 0) + ((row as any).usBreastTeaching || 0),
          (row.usHeart || 0) + ((row as any).usHeartTeaching || 0),
          (row.usThy || 0) +
            (row.usNeck || 0) +
            ((row as any).usThyTeaching || 0) +
            ((row as any).usNeckTeaching || 0), // 甲 = Thy + Neck
          (row.usCCA || 0) + ((row as any).usCCATeaching || 0), // 頸動脈(CCA) = CCA
          (row.usPelvisFemale || 0) +
            ((row as any).usPelvisFemaleTeaching || 0),
          (row.usPelvisMale || 0) + ((row as any).usPelvisMaleTeaching || 0),
          (row.ct || 0) + ((row as any).ctTeaching || 0),
          (row.cta || 0) + ((row as any).ctaTeaching || 0),
          row.ctaPostProcessing || 0,
          (row.dx || 0) + ((row as any).dxTeaching || 0),
          (row.mg || 0) + ((row as any).mgTeaching || 0),
          (row.bmd || 0) + ((row as any).bmdTeaching || 0),
          row.reportTyping || 0,
          row.proofreader || 0,
          row.tsmcReport || 0,
          Math.round(
            computeUnits(row, onsiteFieldKeys) +
              (includeEstimation ? row.estOnsiteUnits || 0 : 0),
          ),
          Math.round(
            computeUnits(row, remoteFieldKeys) +
              (includeEstimation ? row.estRemoteUnits || 0 : 0),
          ),
          Math.round(
            computeTotalUnits(row) +
              (includeEstimation
                ? (row.estOnsiteUnits || 0) + (row.estRemoteUnits || 0)
                : 0),
          ),
          teachingLearningRemark,
          row.estRemark || "",
        ]);

        excelRow.height = 35; // 讓資料列也能換行
        excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.font = { size: 11, name: "微軟正黑體" };
          cell.alignment = {
            vertical: "middle",
            horizontal: "center",
            wrapText: true,
          };

          const isBlockEnd = [
            1, 9, 12, 16, 23, 29, 32, 33, 35, 36, 37,
          ].includes(colNumber);
          cell.border = {
            top: { style: "thin", color: { argb: "FFEEEEEE" } },
            left: { style: "thin", color: { argb: "FFEEEEEE" } },
            bottom: { style: "thin", color: { argb: "FFEEEEEE" } },
            right: {
              style: isBlockEnd ? "medium" : "thin",
              color: { argb: isBlockEnd ? "FF888888" : "FFEEEEEE" },
            },
          };

          // 資料列最後三欄顏色
          if (colNumber === 33) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFF9E6" },
            }; // 極淡黃
          } else if (colNumber === 34) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF0F6FA" },
            }; // 極淡藍
          } else if (colNumber === 35) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFDF3EB" },
            }; // 極淡橘
          }
        });
      });

      // 設定欄寬
      worksheet.columns = [
        { width: 12 }, // A: 姓名
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 25 },
        { width: 18 }, // B-I: 上班天數~配合銷假
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 9 },
        { width: 9 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 }, // J-AC: 現場工作量
        { width: 10 },
        { width: 10 },
        { width: 12 }, // AD-AF: 遠班工作量
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 30 },
        { width: 20 }, // AG-AK: 加權, 教學與學習, 預估日期
      ];

      // --- 第二個工作表：排序 ---
      const worksheet2 = workbook.addWorksheet("排序");

      const groupedData: Record<string, any[]> = {};
      const unassignedData: any[] = [];
      groups.forEach((g) => {
        groupedData[g.id] = [];
      });
      filteredDisplayData.forEach((row) => {
        const user = radiographers.find((r) => r.name === row.name);
        const gid = user ? groupAssignments[user.id] : undefined;
        if (gid && groupedData[gid] !== undefined) groupedData[gid].push(row);
        else unassignedData.push(row);
      });

      const sortDesc = (a: any, b: any) => {
        const ta = Math.round(
          computeTotalUnits(a) +
            (includeEstimation
              ? (a.estOnsiteUnits || 0) + (a.estRemoteUnits || 0)
              : 0),
        );
        const tb = Math.round(
          computeTotalUnits(b) +
            (includeEstimation
              ? (b.estOnsiteUnits || 0) + (b.estRemoteUnits || 0)
              : 0),
        );
        return tb - ta;
      };

      const applyHeaderStyle = (rowObj: any, bgArgb: string) => {
        rowObj.height = 35;
        rowObj.eachCell({ includeEmpty: true }, (cell: any) => {
          cell.font = {
            bold: true,
            size: 12,
            name: "微軟正黑體",
            color: { argb: "FF333333" },
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: "center",
            wrapText: true,
          };
          cell.border = {
            top: { style: "thin", color: { argb: "FFCCCCCC" } },
            left: { style: "thin", color: { argb: "FFCCCCCC" } },
            bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
            right: { style: "thin", color: { argb: "FFCCCCCC" } },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: bgArgb },
          };
        });
      };

      const renderGroupSheet2 = (title: string, rows: any[]) => {
        if (rows.length === 0) return;
        rows.sort(sortDesc);

        const titleRow = worksheet2.addRow([title, "", "", "", "", ""]);
        worksheet2.mergeCells(titleRow.number, 1, titleRow.number, 6);
        applyHeaderStyle(titleRow, "FFDDEBF7");
        titleRow.getCell(1).alignment = {
          vertical: "middle",
          horizontal: "left",
          indent: 1,
        };

        const colHeaderRow = worksheet2.addRow([
          "姓名",
          "上班天數",
          "現場單位",
          "遠班單位",
          "總單位",
          "教學與學習",
        ]);
        applyHeaderStyle(colHeaderRow, "FFF2F2F2");

        rows.forEach((row) => {
          const onsite = Math.round(
            computeUnits(row, onsiteFieldKeys) +
              (includeEstimation ? row.estOnsiteUnits || 0 : 0),
          );
          const remote = Math.round(
            computeUnits(row, remoteFieldKeys) +
              (includeEstimation ? row.estRemoteUnits || 0 : 0),
          );
          const total = Math.round(
            computeTotalUnits(row) +
              (includeEstimation
                ? (row.estOnsiteUnits || 0) + (row.estRemoteUnits || 0)
                : 0),
          );

          let richTextValue: any = { richText: [] };
          if (row.teachingDates && Object.keys(row.teachingDates).length > 0) {
            const parts = Object.entries(row.teachingDates).map(
              ([cat, dates]: any) => `${cat}${dates.size}天`,
            );
            richTextValue.richText.push({
              text: `教學：${parts.join("，")}`,
              font: {
                color: { argb: "FFD32F2F" },
                name: "微軟正黑體",
                size: 11,
              },
            });
          }
          if (row.learningDates && Object.keys(row.learningDates).length > 0) {
            const parts = Object.entries(row.learningDates).map(
              ([cat, dates]: any) => `${cat}${dates.size}天`,
            );
            if (richTextValue.richText.length > 0)
              richTextValue.richText.push({ text: "\n" });
            richTextValue.richText.push({
              text: `學習：${parts.join("，")}`,
              font: {
                color: { argb: "FF1976D2" },
                name: "微軟正黑體",
                size: 11,
              },
            });
          }
          const teachingLearningRemark =
            richTextValue.richText.length > 0 ? richTextValue : "";

          const dataRow = worksheet2.addRow([
            row.name,
            row.workDays || 0,
            onsite,
            remote,
            total,
            teachingLearningRemark,
          ]);

          dataRow.height = 35;
          dataRow.eachCell({ includeEmpty: true }, (cell: any) => {
            cell.font = { size: 11, name: "微軟正黑體" };
            cell.alignment = {
              vertical: "middle",
              horizontal: "center",
              wrapText: true,
            };
            cell.border = {
              top: { style: "thin", color: { argb: "FFEEEEEE" } },
              left: { style: "thin", color: { argb: "FFEEEEEE" } },
              bottom: { style: "thin", color: { argb: "FFEEEEEE" } },
              right: { style: "thin", color: { argb: "FFEEEEEE" } },
            };
          });
        });

        worksheet2.addRow([]);
      };

      groups.forEach((g) => renderGroupSheet2(g.name, groupedData[g.id]));
      renderGroupSheet2("未分組", unassignedData);

      worksheet2.columns = [
        { width: 15 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 30 },
      ];

      // --- 第三個工作表：排序+檢查量 ---
      const worksheet3 = workbook.addWorksheet("排序+檢查量");

      const renderGroupSheet3 = (title: string, rows: any[]) => {
        if (rows.length === 0) return;
        rows.sort(sortDesc);

        const titleRow = worksheet3.addRow([
          title,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ]);
        worksheet3.mergeCells(titleRow.number, 1, titleRow.number, 12);
        applyHeaderStyle(titleRow, "FFDDEBF7");
        titleRow.getCell(1).alignment = {
          vertical: "middle",
          horizontal: "left",
          indent: 1,
        };

        const colHeaderRow = worksheet3.addRow([
          "姓名",
          "上班天數",
          "現場單位",
          "場控天數",
          "MR",
          "US",
          "CT+CTA",
          "CTA後處理",
          "BMD+DX+MG",
          "遠班單位",
          "總單位",
          "教學與學習",
        ]);
        applyHeaderStyle(colHeaderRow, "FFF2F2F2");

        // 將現場單位與其附件(場控/MR/US/CT+CTA/CTA後/BMD+DX+MG)上黃色，遠班上藍色，總單位上橘色
        for (let i = 3; i <= 9; i++) {
          colHeaderRow.getCell(i).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFF2CC" },
          };
        }
        colHeaderRow.getCell(10).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFDDEBF7" },
        };
        colHeaderRow.getCell(11).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFCE4D6" },
        };

        rows.forEach((row) => {
          const onsite = Math.round(
            computeUnits(row, onsiteFieldKeys) +
              (includeEstimation ? row.estOnsiteUnits || 0 : 0),
          );
          const remote = Math.round(
            computeUnits(row, remoteFieldKeys) +
              (includeEstimation ? row.estRemoteUnits || 0 : 0),
          );
          const total = Math.round(
            computeTotalUnits(row) +
              (includeEstimation
                ? (row.estOnsiteUnits || 0) + (row.estRemoteUnits || 0)
                : 0),
          );

          const mrTotal = row.mr || 0;
          const usTotal = row.us || 0;
          const ctCtaTotal = (row.ct || 0) + (row.cta || 0);
          const ctaPostTotal = row.ctaPostProcessing || 0;
          const bmdDxMgTotal = (row.bmd || 0) + (row.dx || 0) + (row.mg || 0);

          let richTextValue: any = { richText: [] };
          if (row.teachingDates && Object.keys(row.teachingDates).length > 0) {
            const parts = Object.entries(row.teachingDates).map(
              ([cat, dates]: any) => `${cat}${dates.size}天`,
            );
            richTextValue.richText.push({
              text: `教學：${parts.join("，")}`,
              font: {
                color: { argb: "FFD32F2F" },
                name: "微軟正黑體",
                size: 11,
              },
            });
          }
          if (row.learningDates && Object.keys(row.learningDates).length > 0) {
            const parts = Object.entries(row.learningDates).map(
              ([cat, dates]: any) => `${cat}${dates.size}天`,
            );
            if (richTextValue.richText.length > 0)
              richTextValue.richText.push({ text: "\n" });
            richTextValue.richText.push({
              text: `學習：${parts.join("，")}`,
              font: {
                color: { argb: "FF1976D2" },
                name: "微軟正黑體",
                size: 11,
              },
            });
          }
          const teachingLearningRemark =
            richTextValue.richText.length > 0 ? richTextValue : "";

          const dataRow = worksheet3.addRow([
            row.name,
            row.workDays || 0,
            onsite,
            row.floorControl || 0,
            mrTotal,
            usTotal,
            ctCtaTotal,
            ctaPostTotal,
            bmdDxMgTotal,
            remote,
            total,
            teachingLearningRemark,
          ]);

          dataRow.height = 35;
          dataRow.eachCell({ includeEmpty: true }, (cell: any) => {
            cell.font = { size: 11, name: "微軟正黑體" };
            cell.alignment = {
              vertical: "middle",
              horizontal: "center",
              wrapText: true,
            };
            cell.border = {
              top: { style: "thin", color: { argb: "FFEEEEEE" } },
              left: { style: "thin", color: { argb: "FFEEEEEE" } },
              bottom: { style: "thin", color: { argb: "FFEEEEEE" } },
              right: { style: "thin", color: { argb: "FFEEEEEE" } },
            };
          });
        });

        worksheet3.addRow([]);
      };

      groups.forEach((g) => renderGroupSheet3(g.name, groupedData[g.id]));
      renderGroupSheet3("未分組", unassignedData);

      worksheet3.columns = [
        { width: 12 }, // 姓名
        { width: 10 }, // 上班天數
        { width: 10 }, // 現場單位
        { width: 10 }, // 場控天數
        { width: 10 }, // MR
        { width: 10 }, // US
        { width: 12 }, // CT+CTA
        { width: 14 }, // CTA後處理
        { width: 16 }, // BMD+DX+MG
        { width: 10 }, // 遠班單位
        { width: 10 }, // 總單位
        { width: 30 }, // 教學與學習
      ];

      // --- 第四個工作表：個人專屬表單 (劉雅萍) ---
      const liuyapingData = workloadData.find((r) => r.name === "劉雅萍");
      if (liuyapingData) {
        // 隱藏格線，讓整體看起來更像 Dashboard
        const ws4 = workbook.addWorksheet("劉雅萍", {
          views: [{ showGridLines: false }],
        });

        ws4.columns = [
          { width: 3 }, // A: Spacer / Indent
          { width: 30 }, // B: Primary Label / Text
          { width: 12 }, // C: Value 1
          { width: 15 }, // D: Label 2 / Suffix
          { width: 12 }, // E: Value 2
          { width: 35 }, // F: Extra text / Notes
        ];

        // Helpers
        const addHeader = (
          title: string,
          bg: string,
          fontColor: string = "FFFFFFFF",
        ) => {
          const r = ws4.addRow(["", title, "", "", "", ""]);
          ws4.mergeCells(`B${r.number}:F${r.number}`);
          r.height = 35;
          r.getCell(2).font = {
            name: "微軟正黑體",
            size: 16,
            bold: true,
            color: { argb: fontColor },
          };
          r.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
          for (let i = 2; i <= 6; i++) {
            r.getCell(i).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: bg },
            };
          }
          return r;
        };

        const addSubHeader = (title: string) => {
          ws4.addRow([]); // spacer
          const r = ws4.addRow(["", title, "", "", "", ""]);
          ws4.mergeCells(`B${r.number}:F${r.number}`);
          r.height = 25;
          r.getCell(2).font = {
            name: "微軟正黑體",
            size: 14,
            bold: true,
            color: { argb: "FF0052CC" },
          };
          r.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
          for (let i = 2; i <= 6; i++) {
            r.getCell(i).border = {
              bottom: { style: "medium", color: { argb: "FF0052CC" } },
            };
          }
        };

        const addMetricRow = (
          label1: string,
          val1: number,
          suffix1: string,
          label2?: string,
          val2?: number,
          suffix2?: string,
        ) => {
          const r = ws4.addRow([
            "",
            label1,
            val1,
            suffix1,
            label2 || "",
            val2 !== undefined ? val2 : "",
          ]);
          r.height = 22;
          r.getCell(2).font = {
            name: "微軟正黑體",
            size: 12,
            bold: true,
            color: { argb: "FF555555" },
          };
          r.getCell(2).alignment = { vertical: "middle", horizontal: "left" };

          r.getCell(3).font = {
            name: "微軟正黑體",
            size: 14,
            bold: true,
            color: { argb: "FFD32F2F" },
          };
          r.getCell(3).alignment = { vertical: "middle", horizontal: "center" };

          r.getCell(4).font = {
            name: "微軟正黑體",
            size: 12,
            color: { argb: "FF777777" },
          };
          r.getCell(4).alignment = { vertical: "middle", horizontal: "left" };

          if (label2) {
            r.getCell(5).font = {
              name: "微軟正黑體",
              size: 12,
              bold: true,
              color: { argb: "FF555555" },
            };
            r.getCell(5).alignment = {
              vertical: "middle",
              horizontal: "right",
            };
            r.getCell(6).font = {
              name: "微軟正黑體",
              size: 14,
              bold: true,
              color: { argb: "FF1976D2" },
            };
            r.getCell(6).alignment = {
              vertical: "middle",
              horizontal: "center",
            };

            // Add suffix2 to F if needed? Actually we can just append it to label2 or just put it in F
            if (suffix2) {
              const f = r.getCell(7); // Column G isn't defined in columns but we can put suffix there, or just keep it simple.
              // Let's just put it in F and let it align left
              r.getCell(7).value = suffix2;
              r.getCell(7).font = {
                name: "微軟正黑體",
                size: 12,
                color: { argb: "FF777777" },
              };
              r.getCell(7).alignment = {
                vertical: "middle",
                horizontal: "left",
              };
            }
          }
          return r;
        };

        const addTextRow = (text: string, isIndented = false) => {
          const prefix = isIndented ? "    " : "";
          const r = ws4.addRow(["", prefix + text, "", "", "", ""]);
          ws4.mergeCells(`B${r.number}:F${r.number}`);
          r.height = 22;
          r.getCell(2).font = {
            name: "微軟正黑體",
            size: 12,
            color: { argb: isIndented ? "FF555555" : "FF333333" },
          };
          r.getCell(2).alignment = {
            vertical: "middle",
            horizontal: "left",
            wrapText: true,
          };
          return r;
        };

        // Header
        addHeader(`劉雅萍 工作職責與績效總覽 (${y}年第${m}週期)`, "FF0F4C81"); // Dark blue

        // 1. 出勤與工時 (Summary box)
        addSubHeader("【出勤與工時彙總】");
        const totalDays = liuyapingData.workDays || 0;
        const remoteDays = liuyapingData.remoteDays || 0;
        const nonRemoteDays = totalDays - remoteDays;

        // Put "總天" first as requested
        addMetricRow(
          "◆ 總上班天數",
          totalDays,
          "天",
          "總時數",
          totalDays * 8,
          "小時",
        );
        addMetricRow(
          "◆ 遠距天數",
          remoteDays,
          "天",
          "遠距時數",
          remoteDays * 8,
          "小時",
        );
        addMetricRow(
          "◆ 現場/非遠距天數",
          nonRemoteDays,
          "天",
          "現場時數",
          nonRemoteDays * 8,
          "小時",
        );

        // 2. 影像報告
        addSubHeader("【影像報告】");
        const reportTyping = liuyapingData.reportTyping || 0;
        const proofreader = liuyapingData.proofreader || 0;
        const tsmcReport = liuyapingData.tsmcReport || 0;

        addMetricRow("• 報告登打", reportTyping, "份");
        addMetricRow("• 校對影像", proofreader, "份"); // put extra note in label2
        addMetricRow("• 台積電登打校對", tsmcReport, "份");

        // 3. 專案推動
        addSubHeader("【專案推動】");
        addTextRow("• 一森專案：排程、流程優化、月報彙整、ARIA手寫單");
        addTextRow("• 智慧醫療合作（醫師 / 報告組 / 放射）:");
        addTextRow(">> 遠健(遠距報告)、一森專案、報告系統優化", true);
        addTextRow(">> 大直超音波初步登打及校對", true);
        addTextRow(">> 台積電報告登打及校對", true);
        addTextRow(">> 一森檢查前SOAP確認", true);
        addTextRow(">> 一森報告校對", true);
        addTextRow(
          ">> 影像醫學部排班系統 + 全院排班系統(含醫師、基因、大直健管)",
          true,
        );
        addTextRow(">> Vibe coding：排班系統 / 報告登打片語庫", true);

        // 4. 人員管理與行政支援
        addSubHeader("【人員管理與行政支援】");
        addTextRow("放射科部門科務管理:");
        addTextRow(
          "• 放射師人員成長儀表版 (技能/配合度/公事務參與/潛能)",
          true,
        );
        addTextRow("• 放射師整月工作量單位u 統計 (現場/遠班/總)", true);
        addTextRow("• 放射師每日工作量", true);
        addTextRow("• 放射師每週期崗位安排", true);
        addTextRow("• 協助工讀生排班與任務分配", true);
        addTextRow("• 處理衛材耗材清點與請購", true);
        addTextRow("• Neupid 系統放射數據統計與月報統整", true);
        addTextRow("• 放射師評核、受訓安排、人力搜尋、招募", true);
        addTextRow("• 光碟燒錄流程優化", true);
        addTextRow("• 膠片配章管理", true);
        addTextRow("• 科會安排", true);

        // 5. 職責內容總覽
        addSubHeader("【職責內容總覽】");
        addTextRow("• 遠健公司：與醫師工作、智慧醫療數據、AI工具");
        addTextRow("• 現場流程：協助支援北投/大直現場作業、人力招募與環境優化");
        addTextRow("• 培育放射師多專才、提供臨床技術指導");
        addTextRow("• 儀器保養維護管理");
        addTextRow("• 協助醫師報告、影像校對、現場崗位支援");
        addTextRow("• 影像相關資訊系統 / 硬體問題排除");
      }

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
      <div className="flex-none px-4 py-3 md:px-6 md:py-4 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-1.5 md:p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
              <BarChart3 className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                <span>放射師工作量</span>
              </h2>
              <div className="text-[10px] md:text-xs text-slate-500 font-bold mt-1.5 flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded shrink-0">
                    一般
                  </span>
                  <span className="truncate">
                    {generalDates[0]?.replace(/-/g, "/")} ~{" "}
                    {generalDates[generalDates.length - 1]?.replace(/-/g, "/")}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded shrink-0">
                    報告
                  </span>
                  <span className="truncate">
                    {reportDates[0]?.replace(/-/g, "/")} ~{" "}
                    {reportDates[reportDates.length - 1]?.replace(/-/g, "/")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 flex-wrap md:flex-nowrap w-full md:w-auto">
            {cycles && cycles.length > 0 ? (
              <select
                value={currentMonth}
                onChange={(e) => setCurrentMonth(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700 bg-white"
              >
                {cycles.map((c) => {
                  const [y, m] = c.name.split("/");
                  if (!y || !m)
                    return (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    );
                  const val = `${y}-${String(m).padStart(2, "0")}`;
                  return (
                    <option key={c.id} value={val}>
                      第 {m} 週期 ({c.name})
                    </option>
                  );
                })}
              </select>
            ) : (
              <input
                type="month"
                value={currentMonth}
                onChange={(e) => setCurrentMonth(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700 bg-white"
              />
            )}

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
                單日
              </span>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-sm bg-transparent outline-none focus:ring-0 font-bold text-slate-700 appearance-none cursor-pointer"
              >
                <option value="">(全部)</option>
                {generalDates.map((d) => (
                  <option key={d} value={d}>
                    {d.substring(5)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
                統計至
              </span>
              <input
                type="date"
                value={estimationStartDate}
                onChange={(e) => setEstimationStartDate(e.target.value)}
                className="text-sm bg-transparent outline-none focus:ring-0 font-bold text-slate-700"
              />
              <label className="flex items-center gap-1 ml-2 cursor-pointer border-l border-slate-300 pl-2">
                <input
                  type="checkbox"
                  checked={includeEstimation}
                  onChange={(e) => setIncludeEstimation(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
                  計入總和
                </span>
              </label>
            </div>

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
                {/* 匯入群組 */}
                <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg shadow-sm">
                  <div className="flex items-center pl-1.5">
                    <span className="text-xs text-slate-500 font-bold whitespace-nowrap">
                      目標:
                    </span>
                    <select
                      value={importTarget}
                      onChange={(e) =>
                        setImportTarget(e.target.value as WorkloadFieldKey)
                      }
                      className="text-xs text-slate-700 bg-transparent py-1 outline-none font-bold ml-1"
                    >
                      {workloadFieldMeta.map((field) => (
                        <option key={field.key} value={field.key}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 text-xs font-bold transition-colors cursor-pointer rounded ml-1">
                      <UploadCloud size={14} /> 單欄匯入
                      <input
                        type="file"
                        accept=".xls,.xlsx,.csv"
                        className="hidden"
                        onChange={handleImportExcel}
                      />
                    </label>
                  </div>

                  <div className="w-px h-4 bg-slate-200 mx-1"></div>

                  <label
                    className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 text-xs font-bold transition-colors cursor-pointer rounded border border-blue-200"
                    title="匯入每日報表格式的 Excel"
                  >
                    <UploadCloud size={14} /> 每日報表匯入
                    <input
                      type="file"
                      accept=".xls,.xlsx,.csv"
                      className="hidden"
                      onChange={handleImportDailyExcel}
                    />
                  </label>
                </div>

                {/* 匯出群組 */}
                <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg shadow-sm">
                  <button
                    onClick={handleExportDaily}
                    className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded text-xs font-bold transition-colors"
                    title={`匯出 ${currentMonth} 期間的每日明細`}
                  >
                    <FileSpreadsheet size={14} /> 單日匯出
                  </button>
                  <div className="w-px h-4 bg-slate-200 mx-0.5"></div>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 px-2.5 py-1 rounded text-xs font-bold transition-colors"
                  >
                    <FileSpreadsheet size={14} /> 月總匯出
                  </button>
                </div>

                {/* 工具群組 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleEdit}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm"
                  >
                    <Edit3 size={14} /> 編輯
                  </button>
                  <button
                    onClick={() => setShowGroupPanel((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border shadow-sm ${
                      showGroupPanel
                        ? "bg-violet-600 text-white border-violet-700"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <Tag size={14} /> 分類
                  </button>
                </div>
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
                  {showWeights ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800">
                    權重設定
                  </div>
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
              <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2">
                <div className="text-sm font-bold text-slate-700 mb-3">
                  一般項目權重
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                  {workloadFieldMeta
                    .filter(
                      (f) =>
                        !f.key.endsWith("Teaching") &&
                        f.key !== "floorControlOrders",
                    )
                    .map((field) => (
                      <label
                        key={field.key}
                        className="block text-xs text-slate-600"
                      >
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

                <div className="text-sm font-bold text-slate-700 mb-3 mt-6 pt-4 border-t border-slate-100">
                  教學項目權重
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                  {workloadFieldMeta
                    .filter((f) => f.key.endsWith("Teaching"))
                    .map((field) => (
                      <label
                        key={field.key}
                        className="block text-xs text-slate-600"
                      >
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
                          className="w-full rounded border border-slate-200 bg-orange-50/50 px-2 py-2 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-orange-500/20"
                        />
                      </label>
                    ))}
                </div>
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
              <div className="text-sm font-bold text-violet-800 flex items-center gap-2">
                <Tag size={14} /> 分類管理
              </div>
              <button
                onClick={() => setShowGroupPanel(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddGroup()}
                placeholder="輸入分類名稱（如：技術領導、儲備leader）..."
                className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400"
              />
              <button
                onClick={handleAddGroup}
                className="bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1"
              >
                <Plus size={14} /> 新增
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {groups.length === 0 && (
                <div className="text-xs text-slate-400 italic">
                  尚未建立分類，新增後可在下方每人的下拉選單中指定
                </div>
              )}
              {groups.map((g, idx) => (
                <div
                  key={g.id}
                  className="flex items-center gap-1 bg-violet-50 border border-violet-200 pl-2 pr-1 py-1 rounded-lg"
                >
                  {/* reorder */}
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => handleMoveGroup(g.id, "up")}
                      disabled={idx === 0}
                      className="text-violet-400 hover:text-violet-700 disabled:opacity-20 leading-none p-0.5"
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveGroup(g.id, "down")}
                      disabled={idx === groups.length - 1}
                      className="text-violet-400 hover:text-violet-700 disabled:opacity-20 leading-none p-0.5"
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>
                  <input
                    value={g.name}
                    onChange={(e) => handleRenameGroup(g.id, e.target.value)}
                    className="text-sm font-medium text-violet-800 bg-transparent border-none outline-none w-24"
                  />
                  <button
                    onClick={() => handleDeleteGroup(g.id)}
                    className="text-violet-200 hover:text-red-500 transition-colors"
                  >
                    <X size={13} />
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
                    <th className="px-3 py-3 text-center text-violet-600 bg-violet-50/50 whitespace-nowrap">
                      分類
                    </th>
                  )}
                  {workloadFieldMeta
                    .filter(
                      (f) =>
                        !f.key.endsWith("Teaching") &&
                        f.key !== "floorControlPercentage",
                    )
                    .map((field) =>
                      renderSortTh(
                        field.key,
                        field.label,
                        `${getHeaderStyle(field.key)} ${shouldRenderCategorySeparator(field.key) ? "border-r-2 border-slate-300" : ""}`,
                      ),
                    )}
                  {renderSortTh(
                    "onsiteUnits",
                    "現場加權",
                    "bg-slate-100 text-slate-700",
                  )}
                  {renderSortTh(
                    "remoteUnits",
                    "遠班加權",
                    "bg-slate-100 text-slate-700",
                  )}
                  {renderSortTh(
                    "totalUnits",
                    "總加權",
                    "bg-slate-100 text-slate-700",
                  )}
                  {renderSortTh(
                    "dailyAvg",
                    "日平均",
                    "bg-emerald-50 text-emerald-700",
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={
                        workloadFieldMeta.filter(
                          (f) =>
                            !f.key.endsWith("Teaching") &&
                            f.key !== "floorControlPercentage",
                        ).length + (showGroupPanel ? 5 : 4)
                      }
                      className="px-4 py-8 text-center text-slate-400 font-medium"
                    >
                      無資料
                    </td>
                  </tr>
                ) : (
                  displayData.map((row: any, idx) => {
                    const user = radiographers.find((r) => r.name === row.name);
                    const assignedGroupId = user
                      ? groupAssignments[user.id] || ""
                      : "";
                    const assignedGroup = groups.find(
                      (g) => g.id === assignedGroupId,
                    );
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
                              onChange={(e) =>
                                user &&
                                handleAssignGroup(user.id, e.target.value)
                              }
                              className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-700 outline-none focus:ring-1 focus:ring-violet-400 max-w-[80px]"
                            >
                              <option value="">－</option>
                              {groups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        )}
                        {workloadFieldMeta
                          .filter(
                            (f) =>
                              !f.key.endsWith("Teaching") &&
                              f.key !== "floorControlPercentage",
                          )
                          .map((field) => {
                            const isScheduleField =
                              scheduleDerivedFieldKeys.includes(field.key);
                            const getTeachingCount = (baseKey: string) => {
                              const teachingKey = `${baseKey}Teaching`;
                              return (row as any)[teachingKey] || 0;
                            };
                            const teachingCount = getTeachingCount(field.key);
                            const hasTeaching = teachingCount > 0;

                            return (
                              <td
                                key={field.key}
                                className={`px-4 py-2.5 text-center font-medium ${field.key === "cta" || field.key === "ctaPostProcessing" ? "bg-teal-50/10 text-teal-600 font-bold" : field.key === "reportTyping" ? "bg-indigo-50/10 text-indigo-600 font-bold" : field.key === "proofreader" ? "bg-purple-50/10 text-purple-600 font-bold" : "text-slate-700"} ${shouldRenderCategorySeparator(field.key) ? "border-r-2 border-slate-300" : ""}`}
                              >
                                {isEditing && !isScheduleField ? (
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-1">
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
                                      {hasTeaching && (
                                        <span
                                          className="text-[10px] text-orange-600 font-bold whitespace-nowrap"
                                          title="教學數量"
                                        >
                                          (+{teachingCount})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-row items-center justify-center gap-1">
                                    <span>
                                      {field.key === "usThy"
                                        ? (() => {
                                            const v =
                                              (row.usThy || 0) +
                                              (row.usNeck || 0);
                                            return v
                                              ? Math.round(+v * 10) / 10
                                              : "-";
                                          })()
                                        : scheduleDerivedFieldKeys.includes(
                                              field.key,
                                            ) ||
                                            field.key === "floorControlOrders"
                                          ? row[field.key] || "-"
                                          : (() => {
                                              const v = row[field.key];
                                              return v
                                                ? Math.round(+v * 10) / 10
                                                : "-";
                                            })()}
                                    </span>
                                    {field.key === "floorControl" &&
                                      row.estFloorControl > 0 && (
                                        <span
                                          className="text-[10px] text-emerald-600 font-bold whitespace-nowrap ml-0.5"
                                          title="預估場控天數"
                                        >
                                          (+{row.estFloorControl})
                                        </span>
                                      )}
                                    {field.key === "floorControlOrders" &&
                                      row.estFloorControlOrders > 0 && (
                                        <span
                                          className="text-[10px] text-emerald-600 font-bold whitespace-nowrap ml-0.5"
                                          title="預估場控醫令"
                                        >
                                          (+{row.estFloorControlOrders})
                                        </span>
                                      )}
                                    {hasTeaching && (
                                      <span
                                        className="text-xs text-orange-600 font-bold whitespace-nowrap"
                                        title="教學數量"
                                      >
                                        (+{teachingCount})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        <td className="px-4 py-2.5 text-center font-bold text-slate-800 bg-slate-50">
                          {Math.round(
                            computeUnits(row, onsiteFieldKeys) +
                              (includeEstimation ? row.estOnsiteUnits || 0 : 0),
                          )}
                          {row.estOnsiteUnits > 0 && !includeEstimation && (
                            <span className="text-xs text-emerald-600 block leading-tight">
                              +{row.estOnsiteUnits}(預估)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-slate-800 bg-slate-50">
                          {Math.round(
                            computeUnits(row, remoteFieldKeys) +
                              (includeEstimation ? row.estRemoteUnits || 0 : 0),
                          )}
                          {row.estRemoteUnits > 0 && !includeEstimation && (
                            <span className="text-xs text-emerald-600 block leading-tight">
                              +{row.estRemoteUnits}(預估)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-slate-800 bg-slate-50">
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <div className="flex items-center gap-1">
                              <span>
                                {Math.round(
                                  computeTotalUnits(row) +
                                    (includeEstimation
                                      ? (row.estOnsiteUnits || 0) +
                                        (row.estRemoteUnits || 0)
                                      : 0),
                                )}
                              </span>
                            </div>
                            {(row.estOnsiteUnits > 0 ||
                              row.estRemoteUnits > 0) &&
                              !includeEstimation && (
                                <span className="text-xs text-emerald-600 block leading-tight">
                                  +
                                  {(row.estOnsiteUnits || 0) +
                                    (row.estRemoteUnits || 0)}
                                  (預估)
                                </span>
                              )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-emerald-700 bg-emerald-50/50">
                          {(!includeEstimation && estimationStartDate
                            ? row.workedDaysSoFar
                            : row.workDays) > 0
                            ? (
                                Math.round(
                                  ((computeTotalUnits(row) +
                                    (includeEstimation
                                      ? (row.estOnsiteUnits || 0) +
                                        (row.estRemoteUnits || 0)
                                      : 0)) /
                                    (!includeEstimation && estimationStartDate
                                      ? row.workedDaysSoFar
                                      : row.workDays)) *
                                    10,
                                ) / 10
                              ).toFixed(1)
                            : "-"}
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
          <div className="flex flex-col md:flex-row md:items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <MessageSquare size={15} className="text-green-600" />
                LINE 複製預覽
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-normal">
                顯示內容：
                <select
                  value={lineExportMode}
                  onChange={(e) => setLineExportMode(e.target.value as any)}
                  className="border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
                >
                  <option value="ALL">綜合 (全部)</option>
                  <option value="ONSITE">現場單位</option>
                  <option value="REMOTE">遠距單班</option>
                  <option value="TOTAL">總單位</option>
                  <option value="TOTAL_AVG">總單位 + 日平均</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col md:items-end gap-2">
              <div className="flex items-center gap-1.5 flex-wrap md:justify-end max-w-full md:max-w-[500px]">
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                  顯示人員：
                </span>
                {radiographers.map((r) => (
                  <label
                    key={r.id}
                    className={`text-[11px] px-1.5 py-0.5 rounded cursor-pointer transition-colors border select-none ${!lineExcludedNames.includes(r.name) ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold" : "bg-white text-slate-400 border-slate-200"}`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={!lineExcludedNames.includes(r.name)}
                      onChange={(e) => {
                        if (e.target.checked)
                          setLineExcludedNames((prev) =>
                            prev.filter((n) => n !== r.name),
                          );
                        else setLineExcludedNames((prev) => [...prev, r.name]);
                      }}
                    />
                    {r.name}
                  </label>
                ))}
              </div>
              <button
                onClick={handleLineCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors w-fit ${
                  lineCopied
                    ? "bg-green-600 text-white"
                    : "bg-green-50 hover:bg-green-100 text-green-700 border border-green-200"
                }`}
              >
                {lineCopied ? (
                  <>
                    <Check size={14} /> 已複製！
                  </>
                ) : (
                  <>
                    <MessageSquare size={14} /> 複製到剪貼簿
                  </>
                )}
              </button>
            </div>
          </div>
          <pre className="p-4 text-sm font-mono text-slate-700 whitespace-pre overflow-x-auto leading-relaxed bg-white">
            {lineText}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default RadiographerWorkloadPage;
