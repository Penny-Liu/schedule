import {
  RadiographerMonthlyReportItem,
  RadiographerMonthlyReportSection,
} from "../types";

export const DEFAULT_RADIOGRAPHER_MONTHLY_REPORT_SECTIONS: RadiographerMonthlyReportSection[] = [
  {
    id: "projects",
    title: "專案推動",
    items: [
      { id: "project-yisen", kind: "bullet", text: "一森專案：排程、流程優化、月報彙整、ARIA手寫單" },
      { id: "project-guandu", kind: "bullet", text: "關渡代檢專案" },
      { id: "project-smart-health", kind: "bullet", text: "智慧醫療合作（醫師 / 報告組 / 放射）:" },
      { id: "project-remote", kind: "detail", text: "遠健(遠距報告)、一森專案、報告系統優化" },
      { id: "project-dazhi-us", kind: "detail", text: "大直超音波初步登打及校對" },
      { id: "project-tsmc", kind: "detail", text: "台積電報告登打及校對" },
      { id: "project-soap", kind: "detail", text: "一森檢查前SOAP確認" },
      { id: "project-proofing", kind: "detail", text: "一森報告校對" },
      { id: "project-schedule", kind: "detail", text: "影像醫學部排班系統 + 全院排班系統(含醫師、基因、大直健管)" },
      { id: "project-vibe", kind: "detail", text: "Vibe coding：排班系統 / 報告登打片語庫" },
    ],
  },
  {
    id: "management",
    title: "人員管理與行政支援",
    items: [
      { id: "management-department", kind: "heading", text: "放射科部門科務管理" },
      { id: "management-growth", kind: "nestedBullet", text: "放射師人員成長儀表版(技能/配合度/公事務參與/潛能)" },
      { id: "management-monthly", kind: "nestedBullet", text: "放射師整月工作量單位u 統計(現場/遠班/總)" },
      { id: "management-daily", kind: "nestedBullet", text: "放射師每日工作量" },
      { id: "management-cycle", kind: "nestedBullet", text: "放射師每週期崗位安排" },
      { id: "management-student", kind: "nestedBullet", text: "協助工讀生排班與任務分配" },
      { id: "management-supplies", kind: "nestedBullet", text: "處理衛材耗材清點與請購" },
      { id: "management-neupid", kind: "nestedBullet", text: "Neupid 系統放射數據統計與月報統整" },
      { id: "management-training", kind: "nestedBullet", text: "放射師評核、受訓安排(親自指導)" },
      { id: "management-disc", kind: "nestedBullet", text: "光碟燒錄流程優化" },
      { id: "management-seal", kind: "nestedBullet", text: "膠片配章管理" },
      { id: "management-meeting", kind: "nestedBullet", text: "科會安排" },
      { id: "management-typhoon", kind: "nestedBullet", text: "颱風班排班、工作安排" },
      { id: "management-hospital", kind: "heading", text: "院務協助" },
      { id: "management-flow", kind: "nestedBullet", text: "現場流程優化" },
      { id: "management-audit", kind: "nestedBullet", text: "醫政督考" },
    ],
  },
  {
    id: "responsibilities",
    title: "職責內容總覽",
    items: [
      { id: "responsibility-remote", kind: "bullet", text: "遠健公司：與醫師工作、智慧醫療數據、AI工具" },
      { id: "responsibility-onsite", kind: "bullet", text: "現場流程(協助支援北投／大直現場作業)、人力招募與環境優化" },
      { id: "responsibility-training", kind: "bullet", text: "培育放射師多專才、提供臨床技術指導" },
      { id: "responsibility-equipment", kind: "bullet", text: "儀器保養維護管理" },
      { id: "responsibility-report", kind: "bullet", text: "協助醫師報告、影像校對、現場崗位支援" },
      { id: "responsibility-it", kind: "bullet", text: "影像相關資訊系統/硬體問題排除" },
      { id: "responsibility-hospital", kind: "bullet", text: "院務協助，如督考、評鑑…" },
    ],
  },
];

export const cloneRadiographerMonthlyReportSections = (
  sections: RadiographerMonthlyReportSection[],
) => sections.map((section) => ({
  ...section,
  items: section.items.map((item) => ({ ...item })),
}));

export const normalizeRadiographerMonthlyReportSections = (
  value: unknown,
): RadiographerMonthlyReportSection[] => {
  if (!Array.isArray(value)) {
    return cloneRadiographerMonthlyReportSections(
      DEFAULT_RADIOGRAPHER_MONTHLY_REPORT_SECTIONS,
    );
  }

  return value.map((section: any, sectionIndex) => ({
    id: String(section?.id || `section-${sectionIndex}`),
    title: String(section?.title || ""),
    items: Array.isArray(section?.items)
      ? section.items.map((item: any, itemIndex: number) => ({
          id: String(item?.id || `section-${sectionIndex}-item-${itemIndex}`),
          kind: ["heading", "bullet", "nestedBullet", "detail"].includes(item?.kind)
            ? item.kind
            : "bullet",
          text: String(item?.text || ""),
        }))
      : [],
  }));
};

export const formatRadiographerMonthlyReportItem = (
  item: RadiographerMonthlyReportItem,
) => {
  const text = item.text.trim();
  if (!text) return { text: "", isIndented: false };
  if (item.kind === "heading") return { text, isIndented: false };
  if (item.kind === "detail") return { text: `>> ${text}`, isIndented: true };
  return {
    text: `• ${text}`,
    isIndented: item.kind === "nestedBullet",
  };
};

export const formatRadiographerMonthlyReportSectionTitle = (title: string) => {
  const trimmed = title.trim().replace(/^【|】$/g, "");
  return trimmed ? `【${trimmed}】` : "";
};
