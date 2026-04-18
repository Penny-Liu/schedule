import React from 'react';
import { User, UserRole } from '../../types';
import { db } from '../../services/store';

interface DailyStatsRowsProps {
    currentUser: User;
    dateRange: string[];
    isMobile: boolean;
}

export const DailyStatsRows: React.FC<DailyStatsRowsProps> = ({ currentUser, dateRange, isMobile }) => {
    if (currentUser.role !== UserRole.SYSTEM_ADMIN && currentUser.role !== UserRole.SUPERVISOR) {
        return null; // Only Admin/Supervisor can see daily stats rows
    }

    return (
        <>
            <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                    <div className="text-xs font-bold text-slate-600 flex items-center justify-end pr-2">北投客戶數</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.beitou_clients || 0}
                                onChange={(e) => db.updateDailyStats(date, { beitou_clients: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>
            <tr className="bg-slate-50">
                <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                    <div className="text-xs font-bold text-slate-600 flex items-center justify-end pr-2">CTA</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.beitou_cta || 0}
                                onChange={(e) => db.updateDailyStats(date, { beitou_cta: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>
            <tr className="bg-slate-50 text-orange-600">
                <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                    <div className="text-[10px] font-bold flex items-center justify-end pr-2 text-right">北投 MR<br />客戶數</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.beitou_mr || 0}
                                onChange={(e) => db.updateDailyStats(date, { beitou_mr: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>
            <tr className="bg-slate-50 text-orange-700">
                <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                    <div className="text-[10px] font-bold flex items-center justify-end pr-2 text-right">北投 MR<br />醫令數</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.beitou_mr_orders || 0}
                                onChange={(e) => db.updateDailyStats(date, { beitou_mr_orders: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>
            <tr className="bg-slate-50 border-t border-slate-200">
                <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                    <div className="text-[10px] font-bold text-slate-600 flex items-center justify-end pr-2 text-right">北投超音波<br />(總量)</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.beitou_ultrasound || 0}
                                onChange={(e) => db.updateDailyStats(date, { beitou_ultrasound: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>
            <tr className="bg-slate-50 text-indigo-600">
                <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                    <div className="text-[10px] font-bold flex items-center justify-end pr-2 text-right">北投心臟<br />超音波</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.beitou_ultrasound_heart || 0}
                                onChange={(e) => db.updateDailyStats(date, { beitou_ultrasound_heart: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>
            <tr className="bg-slate-50 text-rose-600">
                <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                    <div className="text-[10px] font-bold flex items-center justify-end pr-2 text-right">北投肝纖維<br />超音波</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.beitou_ultrasound_fibrosis || 0}
                                onChange={(e) => db.updateDailyStats(date, { beitou_ultrasound_fibrosis: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>
            <tr className="bg-slate-50">
                <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                    <div className="text-[10px] font-bold text-slate-600 flex items-center justify-end pr-2 text-right">大直健檢<br />客戶數</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.dazhi_clients || 0}
                                onChange={(e) => db.updateDailyStats(date, { dazhi_clients: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>
            <tr className="bg-slate-50">
                <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                    <div className="text-[10px] font-bold text-slate-600 flex items-center justify-end pr-2 text-right">大直超音波<br />(總量)</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.dazhi_ultrasound || 0}
                                onChange={(e) => db.updateDailyStats(date, { dazhi_ultrasound: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>
            <tr className="bg-slate-50 text-indigo-600">
                <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                    <div className="text-[10px] font-bold flex items-center justify-end pr-2 text-right">大直心臟<br />超音波</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.dazhi_ultrasound_heart || 0}
                                onChange={(e) => db.updateDailyStats(date, { dazhi_ultrasound_heart: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>
            <tr className="bg-slate-50 text-rose-600">
                <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                    <div className="text-[10px] font-bold flex items-center justify-end pr-2 text-right">大直肝纖維<br />超音波</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.dazhi_ultrasound_fibrosis || 0}
                                onChange={(e) => db.updateDailyStats(date, { dazhi_ultrasound_fibrosis: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>
            <tr className="bg-slate-50">
                <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                    <div className="text-[10px] font-bold text-slate-600 flex items-center justify-end pr-2 text-right">大直代謝<br />客戶數</div>
                </td>
                {dateRange.map(date => {
                    const stats = db.getDailyStats(date);
                    return (
                        <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                            <input
                                type="number"
                                value={stats?.dazhi_metabolism_clients || 0}
                                onChange={(e) => db.updateDailyStats(date, { dazhi_metabolism_clients: Number(e.target.value) })}
                                className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1"
                                placeholder="0"
                            />
                        </td>
                    );
                })}
            </tr>
        </>
    );
};
