import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../services/store';
import { UserRole, Doctor } from '../types';
import { BarChart3, Calendar, Save, AlertCircle, ChevronLeft, ChevronRight, FileText, FileSpreadsheet } from 'lucide-react';
import ExcelJS from 'exceljs';

interface DoctorStatisticsPageProps {
  currentUser: any;
}

const DoctorStatisticsPage: React.FC<DoctorStatisticsPageProps> = ({ currentUser }) => {
  const [doctors, setDoctors] = useState<Doctor[]>(db.getDoctors().filter(d => !d.isPartTime));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize selectedMonth strictly to current YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  // Calculate default start and end dates for a given YYYY-MM strictly for that month
  const getDefaultDatesForMonth = (yearMonth: string) => {
    const [year, month] = yearMonth.split('-').map(Number);
    // Start of month
    const start = new Date(year, month - 1, 1);
    // End of month
    const end = new Date(year, month, 0);

    return {
      startDate: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
      endDate: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    };
  };

  const handlePrevMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear--;
    }
    setSelectedMonth(`${prevYear}-${String(prevMonth).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth === 13) {
      nextMonth = 1;
      nextYear++;
    }
    setSelectedMonth(`${nextYear}-${String(nextMonth).padStart(2, '0')}`);
  };

  // Helper to handle input changes
  const handleChange = (doctorId: string, field: 'startDate' | 'endDate' | 'memo', value: string) => {
    setDoctors(prev => prev.map(d => {
      if (d.id === doctorId) {
        const currentCycles = d.personalCycles || {};
        const currentMonthData = currentCycles[selectedMonth] || {
          ...getDefaultDatesForMonth(selectedMonth),
          memo: ''
        };

        return {
          ...d,
          personalCycles: {
            ...currentCycles,
            [selectedMonth]: {
              ...currentMonthData,
              [field]: value
            }
          }
        };
      }
      return d;
    }));
  };

  const handleSave = async (doctor: Doctor) => {
    setSavingId(doctor.id);
    setError(null);
    try {
      await db.updateDoctor(doctor);
    } catch (err: any) {
      setError(`儲存失敗: ${err.message || '未知錯誤'}`);
    } finally {
      setTimeout(() => setSavingId(null), 500); // Small delay to show saved state
    }
  };

  const calculateDays = (startDate?: string, endDate?: string) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    
    // Include both start and end dates
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 0;
  };

  // Pre-calculate shift counts
  const shiftCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    doctors.forEach(doc => {
      // Fallback to the full calendar month if the doctor has no saved cycle for this month
      const savedCycle = doc.personalCycles?.[selectedMonth];
      const defaultDates = getDefaultDatesForMonth(selectedMonth);
      const cycleData = {
        startDate: savedCycle?.startDate || defaultDates.startDate,
        endDate: savedCycle?.endDate || defaultDates.endDate,
      };
      if (!cycleData.startDate || !cycleData.endDate) {
        counts[doc.id] = 0;
        return;
      }
      
      const shifts = db.getDoctorShifts();
      // Count days in the date range where the doctor has any assignment.
      // A shift record existing within the range with either a scheduled_station or a real station means they worked.
      const NON_WORK = ['', '未分配', 'Unassigned', '休假', 'SystemOff', 'X', null, undefined];
      const docShifts = shifts.filter(s => {
        if (s.doctorId !== doc.id) return false;
        if (s.date < cycleData.startDate || s.date > cycleData.endDate) return false;
        // Has a real scheduled_station (actual clinic assignment) OR a real manpower station
        const hasScheduled = !!s.scheduled_station && !NON_WORK.includes(s.scheduled_station.trim());
        const hasStation = !!s.station && !NON_WORK.includes(s.station.trim());
        return hasScheduled || hasStation;
      });
      counts[doc.id] = docShifts.length;
    });
    return counts;
  }, [doctors, selectedMonth]);

  if (currentUser.role !== UserRole.SYSTEM_ADMIN && currentUser.role !== UserRole.SCHEDULER && currentUser.role !== UserRole.VIEWER && currentUser.role !== UserRole.FINANCE) {
    return <div className="p-8 text-center text-gray-500">權限不足</div>;
  }

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`醫師工作統計_${selectedMonth}`);

    const [titleYear, titleMonthNum] = selectedMonth.split('-');
    const titleText = `${titleYear}年 ${parseInt(titleMonthNum, 10)}月 醫師工作統計`;

    // Define columns first (needed before inserting rows)
    sheet.columns = [
      { key: 'name', width: 14 },
      { key: 'specialty', width: 12 },
      { key: 'startDate', width: 14 },
      { key: 'endDate', width: 14 },
      { key: 'totalDays', width: 12 },
      { key: 'shiftDays', width: 12 },
      { key: 'memo', width: 24 },
    ];

    // Row 1: Title
    const titleRow = sheet.getRow(1);
    titleRow.getCell(1).value = titleText;
    titleRow.getCell(1).font = { bold: true, size: 18 };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 36;
    sheet.mergeCells('A1:G1');

    // Row 2: Column headers
    const colHeaders = ['醫師姓名', '科別', '週期開始', '週期結束', '當期天數', '排班天數', '備註'];
    const headerRow = sheet.getRow(2);
    colHeaders.forEach((label, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = label;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // teal-700
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
    });
    headerRow.height = 22;

    const NON_WORK = ['', '未分配', 'Unassigned', '休假', 'SystemOff', 'X', null, undefined];
    const allDoctorShifts = db.getDoctorShifts();

    doctors.forEach(doc => {
      const savedCycle = doc.personalCycles?.[selectedMonth];
      const defaultDates = getDefaultDatesForMonth(selectedMonth);
      const startDate = savedCycle?.startDate || defaultDates.startDate;
      const endDate = savedCycle?.endDate || defaultDates.endDate;

      const start = new Date(startDate);
      const end = new Date(endDate);
      const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const shiftDays = allDoctorShifts.filter(s => {
        if (s.doctorId !== doc.id) return false;
        if (s.date < startDate || s.date > endDate) return false;
        const hasScheduled = !!s.scheduled_station && !NON_WORK.includes(s.scheduled_station.trim());
        const hasStation = !!s.station && !NON_WORK.includes(s.station.trim());
        return hasScheduled || hasStation;
      }).length;

      const row = sheet.addRow({
        name: doc.name,
        specialty: doc.specialty || '',
        startDate,
        endDate,
        totalDays,
        shiftDays,
        memo: savedCycle?.memo || '',
      });
      row.eachCell(cell => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } }
        };
      });
      row.height = 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `醫師工作統計_${selectedMonth}.xlsx`;
    link.click();
  };

  // Determine if it's view only
  const isViewOnly = currentUser.role === UserRole.VIEWER;

  // Format month for display
  const [displayYear, displayMonth] = selectedMonth.split('-');
  const displayMonthStr = `${displayYear} 年 ${parseInt(displayMonth, 10)} 月`;

  return (
    <div className="h-full bg-slate-50 flex flex-col relative overflow-hidden">
      <div className="p-6 md:p-8 flex-1 overflow-y-auto w-full">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3 mb-2">
                <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100 hidden md:block">
                  <BarChart3 className="text-teal-600" size={24} />
                </div>
                醫師工作統計
              </h1>
              <p className="text-sm text-gray-500">設定非兼職醫師每月的週期微調與備忘錄，並檢視實際排班天數。</p>
            </div>
            
            {/* Month Navigation */}
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200">
              <button 
                onClick={handlePrevMonth}
                className="p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                title="上個月"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="font-bold text-gray-700 min-w-[100px] text-center">
                {displayMonthStr}
              </div>
              <button 
                onClick={handleNextMonth}
                className="p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                title="下個月"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 active:scale-95 transition-all shadow-sm shadow-emerald-200"
              title="匯出 Excel"
            >
              <FileSpreadsheet size={16} /> 匯出 Excel
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 border border-red-100">
              <AlertCircle className="shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="font-bold text-sm">發生錯誤</h4>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold w-[15%]">醫師姓名</th>
                    <th className="px-6 py-4 font-bold w-[30%]">本月週期範圍</th>
                    <th className="px-6 py-4 font-bold w-[20%]">備註</th>
                    <th className="px-6 py-4 font-bold text-center w-[12%]">當期天數</th>
                    <th className="px-6 py-4 font-bold text-center w-[12%]">排班天數</th>
                    {!isViewOnly && <th className="px-6 py-4 font-bold text-center w-[11%]">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {doctors.length === 0 ? (
                    <tr>
                      <td colSpan={isViewOnly ? 5 : 6} className="px-6 py-12 text-center text-gray-400">
                        目前沒有非兼職的醫師資料。
                      </td>
                    </tr>
                  ) : (
                    doctors.map(doc => {
                      const savedCycle = doc.personalCycles?.[selectedMonth];
                      const defaultDates = getDefaultDatesForMonth(selectedMonth);
                      const currentMonthData = savedCycle || {
                        ...defaultDates,
                        memo: ''
                      };

                      // Check if dates differ from default (start of month / end of month)
                      const isCustomized = !!savedCycle && (
                        savedCycle.startDate !== defaultDates.startDate ||
                        savedCycle.endDate !== defaultDates.endDate
                      );
                      
                      const currentDays = calculateDays(currentMonthData.startDate, currentMonthData.endDate);
                      const actShifts = shiftCounts[doc.id] || 0;
                      
                      return (
                        <tr key={doc.id} className={`transition-colors ${isCustomized ? 'bg-amber-50 hover:bg-amber-100/60 border-l-4 border-amber-400' : 'hover:bg-slate-50/50'}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-lg shadow-sm border border-gray-200 shrink-0">
                                {doc.alias || doc.name[0]}
                              </div>
                              <div>
                                <div className="font-bold text-gray-800">{doc.name}</div>
                                {doc.specialty && <div className="text-xs text-teal-600 mt-0.5">{doc.specialty}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <Calendar size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                                <input
                                  type="date"
                                  value={currentMonthData.startDate}
                                  onChange={(e) => handleChange(doc.id, 'startDate', e.target.value)}
                                  disabled={isViewOnly}
                                  className="w-full pl-8 pr-1 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
                                />
                              </div>
                              <span className="text-gray-400 font-bold shrink-0">~</span>
                              <div className="relative flex-1">
                                <Calendar size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                                <input
                                  type="date"
                                  value={currentMonthData.endDate}
                                  onChange={(e) => handleChange(doc.id, 'endDate', e.target.value)}
                                  disabled={isViewOnly}
                                  className="w-full pl-8 pr-1 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="relative">
                              <FileText size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                              <input
                                type="text"
                                placeholder="備註..."
                                value={currentMonthData.memo}
                                onChange={(e) => handleChange(doc.id, 'memo', e.target.value)}
                                disabled={isViewOnly}
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center min-w-[3rem] px-2 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-100">
                              {currentDays} 天
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center min-w-[3rem] px-2 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-100">
                              {actShifts} 天
                            </span>
                          </td>
                          {!isViewOnly && (
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => handleSave(doc)}
                                disabled={savingId === doc.id}
                                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold transition-all w-20 mx-auto ${
                                  savingId === doc.id
                                    ? 'bg-green-100 text-green-700 pointer-events-none'
                                    : 'bg-teal-600 text-white hover:bg-teal-700 active:scale-95 shadow-sm shadow-teal-200'
                                }`}
                              >
                                {savingId === doc.id ? (
                                  '已儲存'
                                ) : (
                                  <>
                                    <Save size={14} /> 儲存
                                  </>
                                )}
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorStatisticsPage;
