<template>
  <button
    @click="handleExport"
    :disabled="isExporting"
    class="inline-flex items-center justify-center rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
  >
    <svg
      v-if="isExporting"
      class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      ></circle>
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
    <span v-if="isExporting">匯出中...</span>
    <span v-else>📊 匯出 {{ year }}年 {{ month }}月 統計</span>
  </button>
</template>

<script setup>
import { ref } from "vue";
import ExcelJS from "exceljs";
// ⚠️ 請將下方的路徑替換成您實際專案中 Supabase client 的路徑
// 例如: import { supabase } from '@/utils/supabaseClient'
import { supabase } from "../supabaseClient.js";

const props = defineProps({
  year: {
    type: Number,
    required: true,
  },
  month: {
    type: Number,
    required: true,
  },
});

const isExporting = ref(false);

async function handleExport() {
  if (isExporting.value) return;
  isExporting.value = true;

  try {
    // 1. 從 Supabase 取得該月份資料
    const { data, error } = await supabase
      .from("radiographer_workload")
      .select("*")
      .eq("year", props.year)
      .eq("month", props.month)
      .order("radiographerName", { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) {
      alert(`⚠️ ${props.year} 年 ${props.month} 月尚無任何工作量資料。`);
      return;
    }

    // 2. 建立 Excel Workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("放射師工作量統計");

    // 設定大標題 (合併 A1 到 I1)
    sheet.mergeCells("A1:I1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = `放射師工作量統計 - ${props.year}年 ${String(props.month).padStart(2, "0")}月`;
    titleCell.font = { name: "微軟正黑體", size: 16, bold: true };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };

    // 定義欄位標題與寬度 (第 2 列)
    sheet.getRow(2).values = [
      "姓名",
      "MR",
      "CT",
      "US",
      "DX",
      "MG",
      "BMD",
      "影像校對",
      "個人總計",
    ];

    const columnsWidth = [15, 10, 10, 10, 10, 10, 10, 12, 12];
    sheet.columns.forEach((col, i) => {
      col.width = columnsWidth[i];
    });

    // 設定標題列樣式
    const headerRow = sheet.getRow(2);
    headerRow.font = {
      name: "微軟正黑體",
      size: 12,
      bold: true,
      color: { arg: "FFFFFFFF" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { arg: "FF4F81BD" }, // 標題背景色 (藍色)
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // 3. 填入資料與計算總計
    const totals = {
      mr: 0,
      ct: 0,
      us: 0,
      dx: 0,
      mg: 0,
      bmd: 0,
      proof: 0,
      all: 0,
    };

    data.forEach((row) => {
      const personTotal =
        (row.mr || 0) +
        (row.ct || 0) +
        (row.us || 0) +
        (row.dx || 0) +
        (row.mg || 0) +
        (row.bmd || 0) +
        (row.imageProofing || 0);

      totals.mr += row.mr || 0;
      totals.ct += row.ct || 0;
      totals.us += row.us || 0;
      totals.dx += row.dx || 0;
      totals.mg += row.mg || 0;
      totals.bmd += row.bmd || 0;
      totals.proof += row.imageProofing || 0;
      totals.all += personTotal;

      const dataRow = sheet.addRow([
        row.radiographerName,
        row.mr || 0,
        row.ct || 0,
        row.us || 0,
        row.dx || 0,
        row.mg || 0,
        row.bmd || 0,
        row.imageProofing || 0,
        personTotal,
      ]);

      dataRow.font = { name: "微軟正黑體", size: 11 };
      dataRow.alignment = { vertical: "middle", horizontal: "center" };
      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    // 新增底部「總計」列
    const summaryRow = sheet.addRow([
      "總計",
      totals.mr,
      totals.ct,
      totals.us,
      totals.dx,
      totals.mg,
      totals.bmd,
      totals.proof,
      totals.all,
    ]);
    summaryRow.font = {
      name: "微軟正黑體",
      size: 12,
      bold: true,
      color: { arg: "FF000000" },
    };
    summaryRow.alignment = { vertical: "middle", horizontal: "center" };
    summaryRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { arg: "FFF2F2F2" },
      }; // 淺灰背景
      cell.border = {
        top: { style: "double" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // 4. 透過瀏覽器下載檔案
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `放射師工作量統計_${props.year}年${String(props.month).padStart(2, "0")}月.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("❌ 匯出失敗:", error);
    alert("匯出失敗: " + (error.message || "發生未知錯誤"));
  } finally {
    isExporting.value = false;
  }
}
</script>
