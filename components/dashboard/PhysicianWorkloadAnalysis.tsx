import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";
import {
  Calendar,
  Download,
  TrendingUp,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { loadExcelJS } from "../../services/exportLibraries";
import { downloadExcelBuffer, finalizeExcelWorksheet, initializeExcelWorkbook, styleExcelTitle } from "../../services/excelReportUtils";

interface PhysicianWorkloadData {
  date: string;
  doctor_name: string;
  mr_count: number;
  has_special_ct: boolean;
  category: string;
  count_da_tao_5: number;
  count_xiao_tao_4: number;
  count_xiao_tao_3: number;
  count_wu_2: number;
  count_wu_1: number;
  count_dazhi_1: number;
  updated_at: string;
}

interface AggregatedWorkload {
  doctor_name: string;
  total_mr: number;
  total_da_tao_5: number;
  total_xiao_tao_4: number;
  total_xiao_tao_3: number;
  total_wu_2: number;
  total_wu_1: number;
  total_dazhi_1: number;
  total_units: number;
  dates_count: number;
}

interface PhysicianWorkloadAnalysisProps {
  currentUser: any;
}

const PhysicianWorkloadAnalysis: React.FC<PhysicianWorkloadAnalysisProps> = ({
  currentUser,
}) => {
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  });

  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(y, today.getMonth() + 1, 0).getDate();
    return `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  });

  const [workloadData, setWorkloadData] = useState<PhysicianWorkloadData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 載入資料
  const fetchWorkloadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("physician_workload_daily")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setWorkloadData((data as PhysicianWorkloadData[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setIsLoading(false);
    }
  };

  // 計算累計資料
  const aggregatedData = useMemo(() => {
    const grouped: Record<string, AggregatedWorkload> = {};

    workloadData.forEach((row) => {
      if (!grouped[row.doctor_name]) {
        grouped[row.doctor_name] = {
          doctor_name: row.doctor_name,
          total_mr: 0,
          total_da_tao_5: 0,
          total_xiao_tao_4: 0,
          total_xiao_tao_3: 0,
          total_wu_2: 0,
          total_wu_1: 0,
          total_dazhi_1: 0,
          total_units: 0,
          dates_count: 0,
        };
      }

      grouped[row.doctor_name].total_mr += row.mr_count || 0;
      grouped[row.doctor_name].total_da_tao_5 += row.count_da_tao_5 || 0;
      grouped[row.doctor_name].total_xiao_tao_4 += row.count_xiao_tao_4 || 0;
      grouped[row.doctor_name].total_xiao_tao_3 += row.count_xiao_tao_3 || 0;
      grouped[row.doctor_name].total_wu_2 += row.count_wu_2 || 0;
      grouped[row.doctor_name].total_wu_1 += row.count_wu_1 || 0;
      grouped[row.doctor_name].total_dazhi_1 += row.count_dazhi_1 || 0;
      grouped[row.doctor_name].dates_count += 1;
    });

    // 計算總單位數
    Object.values(grouped).forEach((doctor) => {
      doctor.total_units =
        doctor.total_da_tao_5 * 5 +
        doctor.total_xiao_tao_4 * 4 +
        doctor.total_xiao_tao_3 * 3 +
        doctor.total_wu_2 * 2 +
        doctor.total_wu_1 * 1 +
        doctor.total_dazhi_1 * 0.6;
    });

    // 按「單位/天」從高到低排序
    return Object.values(grouped).sort((a, b) => {
      const unitPerDayA = a.dates_count > 0 ? a.total_units / a.dates_count : 0;
      const unitPerDayB = b.dates_count > 0 ? b.total_units / b.dates_count : 0;
      return unitPerDayB - unitPerDayA;
    });
  }, [workloadData]);

  // 匯出為 Excel
  const handleExportExcel = async () => {
    if (aggregatedData.length === 0) {
      alert("沒有資料可匯出");
      return;
    }

    try {
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("醫師工作量統計");
      initializeExcelWorkbook(workbook, `醫師工作量統計 ${startDate} ~ ${endDate}`);

      // 設定標題
      styleExcelTitle(worksheet, `醫師工作量統計 (${startDate} ~ ${endDate})`, 11);

      // 設定列頭
      const headers = [
        "醫師名稱",
        "大套5",
        "小套4",
        "小套3",
        "無2",
        "無1",
        "直0.6",
        "總判讀醫令",
        "總單位數",
        "判讀天數",
        "單位/天",
      ];

      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE6E6E6" },
        };
        cell.font = { bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // 新增資料列
      aggregatedData.forEach((doctor) => {
        const unitPerDay =
          doctor.dates_count > 0
            ? Number((doctor.total_units / doctor.dates_count).toFixed(1))
            : 0;
        const row = worksheet.addRow([
          doctor.doctor_name,
          Number(doctor.total_da_tao_5.toFixed(1)),
          Number(doctor.total_xiao_tao_4.toFixed(1)),
          Number(doctor.total_xiao_tao_3.toFixed(1)),
          Number(doctor.total_wu_2.toFixed(1)),
          Number(doctor.total_wu_1.toFixed(1)),
          Number(doctor.total_dazhi_1.toFixed(1)),
          Number(doctor.total_mr.toFixed(1)),
          doctor.total_units,
          doctor.dates_count,
          unitPerDay,
        ]);

        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.alignment = { horizontal: "center", vertical: "middle" };

          // 數字格式
          if (colNumber > 1) {
            if (colNumber === 10) {
              cell.numFmt = "0";
            } else {
              cell.numFmt = "0.0";
            }
          }

          // 突出顯示總單位數較高的醫師
          if (colNumber === 9) {
            const maxUnits = Math.max(
              ...aggregatedData.map((d) => d.total_units),
            );
            if (cell.value === maxUnits) {
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFFFFFE0" },
              };
            }
          }
        });
      });

      // 設定欄寬
      worksheet.columns = [
        { width: 15 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
      ];

      // 下載
      finalizeExcelWorksheet(worksheet, { headerRows: [2], dataStartRow: 3, lastColumn: 11, autoFilter: true });
      const buffer = await workbook.xlsx.writeBuffer();
      downloadExcelBuffer(buffer, `醫師工作量統計_${startDate}_to_${endDate}.xlsx`);
    } catch (err) {
      alert("匯出失敗");
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* 日期選擇區 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Calendar size={20} className="text-teal-600" />
          選擇日期範圍
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">
              開始日期
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">
              結束日期
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={fetchWorkloadData}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <TrendingUp size={16} />
              )}
              查詢統計
            </button>
          </div>
        </div>
      </div>

      {/* 錯誤訊息 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3 items-start">
          <AlertCircle className="text-red-600 mt-0.5" size={18} />
          <div>
            <p className="font-bold text-red-800">載入失敗</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* 統計結果 */}
      {workloadData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">
              統計結果 ({aggregatedData.length} 位醫師)
            </h3>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 font-bold rounded-lg border border-green-200 transition-all"
            >
              <Download size={16} />
              匯出 Excel
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-bold text-slate-600">
                    醫師名稱
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-slate-600">
                    大套5
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-slate-600">
                    小套4
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-slate-600">
                    小套3
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-slate-600">
                    無2
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-slate-600">
                    無1
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-slate-600">直0.6</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-slate-600">
                    判讀醫令
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-teal-600 bg-teal-50">
                    總單位數
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-slate-600">
                    判讀天數
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-purple-600 bg-purple-50">
                    單位/天
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {aggregatedData.map((doctor, idx) => (
                  <tr
                    key={doctor.doctor_name}
                    className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                  >
                    <td className="px-6 py-3 font-bold text-slate-800">
                      {doctor.doctor_name}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {doctor.total_da_tao_5.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {doctor.total_xiao_tao_4.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {doctor.total_xiao_tao_3.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {doctor.total_wu_2.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {doctor.total_wu_1.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {doctor.total_dazhi_1.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {doctor.total_mr.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-teal-700 bg-teal-50 text-lg">
                      {doctor.total_units.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {doctor.dates_count}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-purple-700 bg-purple-50">
                      {doctor.dates_count > 0
                        ? (doctor.total_units / doctor.dates_count).toFixed(1)
                        : "0.0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 統計摘要 */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-teal-600">
                {aggregatedData.length}
              </div>
              <div className="text-xs text-slate-600 font-medium">參與醫師</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-800">
                {aggregatedData
                  .reduce((sum, d) => sum + d.total_units, 0)
                  .toFixed(1)}
              </div>
              <div className="text-xs text-slate-600 font-medium">總單位數</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-800">
                {(
                  aggregatedData.reduce((sum, d) => sum + d.total_units, 0) /
                  (aggregatedData.length || 1)
                ).toFixed(1)}
              </div>
              <div className="text-xs text-slate-600 font-medium">
                平均單位數
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-800">
                {aggregatedData
                  .reduce((sum, d) => sum + d.total_mr, 0)
                  .toFixed(1)}
              </div>
              <div className="text-xs text-slate-600 font-medium">
                總判讀醫令
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 空狀態 */}
      {!isLoading && workloadData.length === 0 && !error && (
        <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-12 text-center">
          <TrendingUp className="mx-auto mb-4 text-slate-400" size={32} />
          <p className="text-slate-600 font-medium mb-2">
            請選擇日期範圍並點擊「查詢統計」開始分析
          </p>
          <p className="text-slate-500 text-sm">
            系統將從 Salesforce 同步資料中計算醫師的累計工作量
          </p>
        </div>
      )}
    </div>
  );
};

export default PhysicianWorkloadAnalysis;
