import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { RadiographerDailyWorkload, Shift } from '../../types';

interface DailyDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  radiographerName: string;
  dates: string[];
  cycleStartDate?: string;
  cycleEndDate?: string;
  initialData: RadiographerDailyWorkload[];
  userShifts: Shift[];
  weights: Record<string, number>;
  getDailyTotalOrders: (date: string) => number;
  onSave: (records: Partial<RadiographerDailyWorkload>[]) => Promise<void>;
}

const FIELDS = [
  { key: "mr", label: "MR醫令數(mr)" },
  { key: "mrLargeMale", label: "mr大男" },
  { key: "mrLargeFemale", label: "mr大女" },
  { key: "mrMedium", label: "mr中" },
  { key: "mrSmall", label: "mr小" },
  { key: "us", label: "US" },
  { key: "usBreast", label: "乳超" },
  { key: "usThy", label: "甲狀" },
  { key: "usHeart", label: "心超" },
  { key: "usCCA", label: "頸動" },
  { key: "usNeck", label: "頸部" },
  { key: "usPelvisFemale", label: "女骨盆" },
  { key: "usPelvisMale", label: "男骨盆" },
  { key: "usFibrosis", label: "肝纖" },
  { key: "usA", label: "超A" },
  { key: "ct", label: "CT" },
  { key: "cta", label: "CTA" },
  { key: "dx", label: "DX" },
  { key: "mg", label: "MG" },
  { key: "bmd", label: "BMD" },
  { key: "ctaPostProcessing", label: "CTA後處理" },
  { key: "reportTyping", label: "報表登打" },
  { key: "proofreader", label: "影像校對" },
  { key: "tsmcReport", label: "台積電" },
];

export const DailyDetailsModal: React.FC<DailyDetailsModalProps> = ({
  isOpen,
  onClose,
  radiographerName,
  dates,
  cycleStartDate,
  cycleEndDate,
  initialData,
  userShifts,
  weights,
  getDailyTotalOrders,
  onSave,
}) => {
  const [editingData, setEditingData] = useState<Record<string, Record<string, number>>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const dataMap: Record<string, Record<string, number>> = {};
      dates.forEach(date => {
        dataMap[date] = {};
        const existingRow = initialData.find(d => d.date === date);
        FIELDS.forEach(f => {
          dataMap[date][f.key] = existingRow ? (existingRow[f.key as keyof RadiographerDailyWorkload] as number || 0) : 0;
        });
      });
      setEditingData(dataMap);
    }
  }, [isOpen, dates, initialData]);

  if (!isOpen) return null;

  const handleValueChange = (date: string, fieldKey: string, valueStr: string) => {
    const val = parseFloat(valueStr) || 0;
    setEditingData(prev => ({
      ...prev,
      [date]: {
        ...prev[date],
        [fieldKey]: val < 0 ? 0 : val
      }
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const recordsToSave: Partial<RadiographerDailyWorkload>[] = [];
      
      dates.forEach(date => {
        const rowData = editingData[date];
        let hasNonZero = false;
        const record: Partial<RadiographerDailyWorkload> = {
          date,
          radiographerName
        };

        FIELDS.forEach(f => {
          const val = rowData[f.key] || 0;
          if (val > 0) hasNonZero = true;
          record[f.key as keyof RadiographerDailyWorkload] = val;
        });

        // Save if any field is > 0 OR if there was existing data for this date
        // to properly zero out fields if they cleared them.
        const hadExistingData = initialData.some(d => d.date === date);
        if (hasNonZero || hadExistingData) {
          recordsToSave.push(record);
        }
      });

      await onSave(recordsToSave);
      onClose();
    } catch (error) {
      console.error(error);
      alert("儲存失敗：" + error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[95vw] flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              單日工作量明細：<span className="text-teal-600">{radiographerName}</span>
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              您可直接在此修改單日明細，儲存後系統將自動重新計算當月總計。
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - Scrollable Table */}
        <div className="flex-1 overflow-auto bg-white p-6 relative">
          <div className="inline-block min-w-full align-middle border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-20">
                <tr>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider sticky left-0 bg-gray-100 border-r border-gray-200 min-w-[100px] z-30 shadow-[1px_0_0_0_#e5e7eb]">
                    日期
                  </th>
                  <th scope="col" className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider sticky left-[100px] bg-gray-100 border-r border-gray-200 min-w-[80px] z-30 shadow-[1px_0_0_0_#e5e7eb]">
                    崗位
                  </th>
                  {FIELDS.map(f => (
                    <th key={f.key} scope="col" className="px-2 py-3 text-center text-xs font-bold text-gray-600 tracking-wider min-w-[60px] max-w-[80px]">
                      {f.label}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-3 text-center text-xs font-bold text-teal-700 uppercase tracking-wider sticky right-0 bg-teal-50 border-l border-gray-200 min-w-[80px] z-30 shadow-[-1px_0_0_0_#e5e7eb]">
                    本日單位
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {dates.map((date) => {
                  const existingRow = initialData.find(d => d.date === date);
                  const isModified = existingRow 
                    ? FIELDS.some(f => (editingData[date]?.[f.key] || 0) !== (existingRow[f.key as keyof RadiographerDailyWorkload] as number || 0))
                    : FIELDS.some(f => (editingData[date]?.[f.key] || 0) > 0);
                  
                  const shift = userShifts.find(s => s.date === date);
                  const stationStr = shift && shift.station !== "未分配" ? `${shift.station}${shift.specialRoles?.length > 0 ? ` (${shift.specialRoles.join(',')})` : ''}` : '-';

                  return (
                    <tr key={date} className={`hover:bg-teal-50 transition-colors ${isModified ? 'bg-orange-50/30' : ''}`}>
                      <td className={`px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 border-r border-gray-100 z-10 shadow-[1px_0_0_0_#f3f4f6] ${isModified ? 'bg-orange-50' : 'bg-white group-hover:bg-teal-50'}`}>
                        {date}
                        {isModified && <span className="ml-2 w-2 h-2 rounded-full bg-orange-400 inline-block" title="已修改" />}
                      </td>
                      <td className={`px-2 py-2 whitespace-nowrap text-xs text-center font-medium text-slate-500 sticky left-[100px] border-r border-gray-100 z-10 shadow-[1px_0_0_0_#f3f4f6] ${isModified ? 'bg-orange-50/50' : 'bg-slate-50 group-hover:bg-teal-50/50'}`}>
                        {stationStr}
                      </td>
                      {FIELDS.map(f => {
                        const inCycle = !cycleStartDate || !cycleEndDate || (date >= cycleStartDate && date <= cycleEndDate);
                        const isApplicable = inCycle || f.key === "proofreader";
                        const val = isApplicable ? (editingData[date]?.[f.key] || 0) : 0;
                        return (
                          <td key={f.key} className="px-1 py-1 whitespace-nowrap text-center">
                            {isApplicable ? (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={val === 0 ? '' : val}
                                onChange={(e) => handleValueChange(date, f.key, e.target.value)}
                                placeholder="0"
                                className="w-full max-w-[60px] text-center text-sm border-b border-transparent focus:border-teal-500 focus:outline-none focus:ring-0 bg-transparent hover:bg-gray-100 py-1 transition-colors mx-auto block rounded-sm"
                              />
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className={`px-2 py-2 whitespace-nowrap text-xs text-center font-bold text-teal-700 sticky right-0 border-l border-gray-100 z-10 shadow-[-1px_0_0_0_#f3f4f6] ${isModified ? 'bg-orange-50/50' : 'bg-teal-50 group-hover:bg-teal-100/50'}`}>
                        {(() => {
                          const inCycle = !cycleStartDate || !cycleEndDate || (date >= cycleStartDate && date <= cycleEndDate);
                          let sum = 0;
                          FIELDS.forEach(f => {
                            if (!inCycle && f.key !== "proofreader") return;
                            sum += (editingData[date]?.[f.key] || 0) * (weights[f.key] || 0);
                          });
                          const shiftsOfDay = userShifts.filter(s => s.date === date);
                          if (inCycle) {
                            shiftsOfDay.forEach(shift => {
                              if (shift.station.includes("場控")) {
                                const pct = (weights.floorControlPercentage ?? 12) / 100;
                                sum += getDailyTotalOrders(date) * pct;
                              }
                              if (shift.specialRoles?.includes("輔班") || shift.station.includes("輔控") || shift.station === "輔") {
                                sum += weights.assist || 0;
                              }
                              if (shift.specialRoles?.includes("排班") || shift.station.includes("排班")) {
                                sum += weights.scheduler || 0;
                              }
                            });
                          }
                          return sum > 0 ? (Math.round(sum * 10) / 10).toFixed(1) : '-';
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 sticky bottom-0 z-20 shadow-[0_-1px_0_0_#e5e7eb]">
                <tr>
                  <td className="px-3 py-3 whitespace-nowrap text-sm font-bold text-gray-900 sticky left-0 bg-gray-50 border-r border-gray-200 z-30 shadow-[1px_0_0_0_#e5e7eb]">
                    總計
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-gray-500 sticky left-[100px] bg-gray-50 border-r border-gray-200 z-30 shadow-[1px_0_0_0_#e5e7eb]">
                    -
                  </td>
                  {FIELDS.map(f => {
                    const total = dates.reduce((sum, d) => {
                      const inCycle = !cycleStartDate || !cycleEndDate || (d >= cycleStartDate && d <= cycleEndDate);
                      if (!inCycle && f.key !== "proofreader") return sum;
                      return sum + (editingData[d]?.[f.key] || 0);
                    }, 0);
                    return (
                      <td key={f.key} className="px-1 py-3 whitespace-nowrap text-center text-sm font-bold text-gray-700">
                        {total > 0 ? Math.round(total * 10) / 10 : '-'}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-center font-bold text-teal-800 sticky right-0 bg-teal-100 border-l border-gray-200 z-30 shadow-[-1px_0_0_0_#e5e7eb]">
                    {(() => {
                      let grandTotal = 0;
                      dates.forEach(date => {
                        const inCycle = !cycleStartDate || !cycleEndDate || (date >= cycleStartDate && date <= cycleEndDate);
                        FIELDS.forEach(f => {
                          if (!inCycle && f.key !== "proofreader") return;
                          grandTotal += (editingData[date]?.[f.key] || 0) * (weights[f.key] || 0);
                        });
                        const shiftsOfDay = userShifts.filter(s => s.date === date);
                        if (inCycle) {
                          shiftsOfDay.forEach(shift => {
                            if (shift.station.includes("場控")) {
                              const pct = (weights.floorControlPercentage ?? 12) / 100;
                              grandTotal += getDailyTotalOrders(date) * pct;
                            }
                            if (shift.specialRoles?.includes("輔班") || shift.station.includes("輔控") || shift.station === "輔") {
                              grandTotal += weights.assist || 0;
                            }
                            if (shift.specialRoles?.includes("排班") || shift.station.includes("排班")) {
                              grandTotal += weights.scheduler || 0;
                            }
                          });
                        }
                      });
                      return grandTotal > 0 ? (Math.round(grandTotal * 10) / 10).toFixed(1) : '-';
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-xl z-20 relative">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors shadow-sm"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-bold rounded-lg shadow-sm text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 transition-colors"
          >
            {isSaving ? (
              <>
                <Loader2 className="animate-spin -ml-1 mr-2" size={16} />
                儲存中...
              </>
            ) : (
              <>
                <Save className="-ml-1 mr-2" size={16} />
                儲存變更
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
