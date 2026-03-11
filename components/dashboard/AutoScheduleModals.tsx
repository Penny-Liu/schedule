import React from 'react';
import ConfirmModal from '../ConfirmModal';
import { Wand2, Loader2 } from 'lucide-react';
import { SPECIAL_ROLES } from '../../types';

interface ScheduleRange {
    start: string;
    end: string;
}

interface AutoScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    scheduleRange: ScheduleRange;
    setScheduleRange: (range: ScheduleRange) => void;
    isProcessing: boolean;
}

export const AutoScheduleModal: React.FC<AutoScheduleModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    scheduleRange,
    setScheduleRange,
    isProcessing
}) => {
    return (
        <ConfirmModal
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            title="自動排班 (一般崗位)"
            message={
                <div className="space-y-4">
                    <p className="font-medium text-gray-800">請設定排班日期範圍</p>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs text-gray-500 font-bold block mb-1">開始日期</label>
                            <input
                                type="date"
                                className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-teal-500 outline-none"
                                value={scheduleRange.start}
                                onChange={(e) => setScheduleRange({ ...scheduleRange, start: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-bold block mb-1">結束日期</label>
                            <input
                                type="date"
                                className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-teal-500 outline-none"
                                value={scheduleRange.end}
                                onChange={(e) => setScheduleRange({ ...scheduleRange, end: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="bg-purple-50 p-3 rounded-lg text-xs text-purple-800 space-y-1 border border-purple-100">
                        <div className="font-bold mb-1 flex items-center gap-1"><Wand2 size={12} /> 說明：</div>
                        <p>• 此功能僅會自動分配<span className="font-bold">工作崗位</span> (如 CT, MRI)。</p>
                        <p>• 將<span className="font-bold">重新隨機洗牌</span>選定範圍內的自動排班。</p>
                        <p>• <span className="font-bold text-red-600">不會</span>更動或分配開機/晚班等特殊任務。</p>
                        <p>• 優先填補空缺，不覆蓋手動鎖定。</p>
                    </div>
                    {isProcessing && (
                        <div className="flex items-center justify-center gap-2 text-purple-600 font-bold text-sm">
                            <Loader2 className="animate-spin" size={16} /> 計算中...
                        </div>
                    )}
                </div>
            }
            confirmText={isProcessing ? "處理中..." : "執行崗位排班"}
            confirmColor="purple"
        />
    );
};

interface AutoScheduleSpecialRoleModalProps extends AutoScheduleModalProps {
    specialRolesToSchedule: string[];
    setSpecialRolesToSchedule: (roles: string[]) => void;
}

export const AutoScheduleSpecialRoleModal: React.FC<AutoScheduleSpecialRoleModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    scheduleRange,
    setScheduleRange,
    specialRolesToSchedule,
    setSpecialRolesToSchedule,
    isProcessing
}) => {
    return (
        <ConfirmModal
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            title="自動排班 (特殊任務)"
            message={
                <div className="space-y-4 text-left">
                    <p className="font-medium text-gray-800">請設定排班條件</p>

                    {/* Date Range Selection (Shared State) */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs text-gray-500 font-bold block mb-1">開始日期</label>
                            <input
                                type="date"
                                className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={scheduleRange.start}
                                onChange={(e) => setScheduleRange({ ...scheduleRange, start: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-bold block mb-1">結束日期</label>
                            <input
                                type="date"
                                className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={scheduleRange.end}
                                onChange={(e) => setScheduleRange({ ...scheduleRange, end: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Role Selection */}
                    <div>
                        <label className="text-xs text-gray-500 font-bold block mb-2">選擇要自動分配的任務</label>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { id: SPECIAL_ROLES.OPENING, label: '開機', color: 'text-blue-700 bg-blue-50 border-blue-200' },
                                { id: SPECIAL_ROLES.LATE, label: '晚班', color: 'text-amber-700 bg-amber-50 border-amber-200' },
                                { id: SPECIAL_ROLES.ASSIST, label: '輔班', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                                { id: SPECIAL_ROLES.SCHEDULER, label: '排班', color: 'text-red-700 bg-red-50 border-red-200' },
                                { id: SPECIAL_ROLES.DAZHI_SUPPORT, label: '大直支援', color: 'text-violet-700 bg-violet-50 border-violet-200' },
                            ].map(role => (
                                <label key={role.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:opacity-80 transition-all ${specialRolesToSchedule.includes(role.id) ? role.color + ' ring-1 ring-offset-1' : 'bg-white border-gray-200 text-gray-500'} `}>
                                    <input
                                        type="checkbox"
                                        checked={specialRolesToSchedule.includes(role.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSpecialRolesToSchedule([...specialRolesToSchedule, role.id]);
                                            } else {
                                                setSpecialRolesToSchedule(specialRolesToSchedule.filter(r => r !== role.id));
                                            }
                                        }}
                                        className="rounded-lg text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm font-bold">{role.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="bg-indigo-50 p-3 rounded-lg text-xs text-indigo-800 space-y-1 border border-indigo-100">
                        <div className="font-bold mb-1 flex items-center gap-1"><Wand2 size={12} /> 說明：</div>
                        <p>• 此功能依序為所選任務尋找合適的排班人員。</p>
                        <p>• 系統會自動考量班距、年資與公平性。</p>
                        <p>• 已有特殊任務的人員當天不會重複排班。</p>
                    </div>

                    {isProcessing && (
                        <div className="flex items-center justify-center gap-2 text-indigo-600 font-bold text-sm">
                            <Loader2 className="animate-spin" size={16} /> 排班中...
                        </div>
                    )}
                </div>
            }
            confirmText={isProcessing ? "處理中..." : "開始自動排班"}
            confirmColor="purple"
        />
    );
};
