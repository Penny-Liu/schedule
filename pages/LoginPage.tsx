import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { db } from '../services/store';
import { LogIn, User as UserIcon, Lock, ChevronLeft, Shield, Calendar, Activity, Eye, ChevronDown } from 'lucide-react';

interface LoginPageProps {
    onLogin: (user: User) => void;
}



const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
    const users = db.getUsers();
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const todayStr = new Date().toISOString().split('T')[0];
    const activeUsers = users.filter(u => 
        u.isActive !== false && 
        u.isPartTime !== true && 
        (!u.resignationDate || u.resignationDate > todayStr)
    );

    // Sort function: Viewer (位居最上方)
    const sortByRole = (a: any, b: any) => {
        if (a.role === UserRole.VIEWER) return -1;
        if (b.role === UserRole.VIEWER) return 1;
        return 0;
    };

    const radiologyPortalUsers = activeUsers.filter(u => 
        u.isRadiographer === true || 
        u.role === UserRole.RADIOGRAPHER_STAFF || 
        (u as any).role === 'EMPLOYEE' ||
        u.role === UserRole.SUPERVISOR || 
        u.role === UserRole.SYSTEM_ADMIN ||
        u.role === UserRole.VIEWER // Add Viewer to radiology portal too
    ).sort(sortByRole);

    const leftPortalUsers = activeUsers.filter(u => 
        u.role === UserRole.VIEWER || // Explicitly include Viewer in Left Portal
        !radiologyPortalUsers.some(ru => ru.id === u.id && ru.role !== UserRole.VIEWER)
    );

    const hmUsers = leftPortalUsers.filter(u => 
        u.isHealthMgmt === true || 
        u.role === UserRole.HM_SUPERVISOR || 
        u.role === UserRole.HM_STAFF
    ).sort(sortByRole);

    const adminAndPhysicianUsers = leftPortalUsers.filter(u => 
        !hmUsers.some(hu => hu.id === u.id)
    ).sort(sortByRole);

    const handleUserSelect = (userId: string) => {
        const user = users.find(u => u.id === userId);
        if (user) {
            setSelectedUser(user);
            setPassword('');
            setError('');
        }
    };

    const handleBack = () => {
        setSelectedUser(null);
        setPassword('');
        setError('');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedUser) {
            const targetPassword = selectedUser.password || '1234';
            if (password === targetPassword) {
                onLogin(selectedUser);
                localStorage.setItem('last_user_id', selectedUser.id);
            } else {
                setError('密碼錯誤，請重試');
            }
        }
    };

    const getRoleLabel = (role: UserRole) => {
        switch (role) {
            case UserRole.SUPERVISOR: return '放射主管';
            case UserRole.SYSTEM_ADMIN: return '系統管理員';
            case UserRole.PHYSICIAN_ADMIN: return '醫師排班管理';
            case UserRole.HM_SUPERVISOR: return '健管主管';
            case UserRole.HM_STAFF: return '健管同仁';
            case UserRole.VIEWER: return '瀏覽者';
            case UserRole.FINANCE: return '財會';
            case UserRole.RADIOGRAPHER_STAFF: return '放射師';
            default: return '工作人員';
        }
    };

    const getRoleIcon = (role: UserRole) => {
         switch (role) {
            case UserRole.SUPERVISOR: 
            case UserRole.HM_SUPERVISOR:
                return <Shield size={14} className="text-purple-500" />;
            case UserRole.SYSTEM_ADMIN: 
                return <Shield size={14} className="text-gray-700" />;
            case UserRole.PHYSICIAN_ADMIN: 
                return <Calendar size={14} className="text-blue-500" />;
            case UserRole.VIEWER: 
                return <Eye size={14} className="text-green-500" />;
            case UserRole.FINANCE: 
                return <Eye size={14} className="text-amber-500" />;
            default: 
                return <Activity size={14} className="text-teal-500" />;
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-gray-800 p-4 lg:p-8 font-sans relative">
            <main className="w-full max-w-6xl shadow-2xl rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 min-h-[700px] bg-white relative z-10">

                {/* Left Side: Physician & HM Portal (Dark/Navy) */}
                <section className="relative text-white p-6 md:p-16 flex flex-col justify-center overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800 bg-[#0F172A]">
                    <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"></div>
                    
                    <div className="relative z-10 w-full max-w-md mx-auto">
                        <div className="mb-8 md:mb-12">
                            {/* Graphic Block */}
                            <div className="relative w-20 h-20 mb-8 animate-float hidden md:block">
                                <div className="absolute inset-2 bg-blue-500 rounded-2xl blur-xl opacity-40"></div>
                                <div className="relative h-full w-full rounded-2xl glass-block flex flex-col items-center justify-center border-t border-l border-white/20 border-b border-r border-black/20 bg-white/5 backdrop-blur-md">
                                    <div className="w-12 h-1.5 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full mb-2 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <div className="w-4 h-1 bg-white/20 rounded-full"></div>
                                        <div className="w-4 h-1 bg-white/20 rounded-full"></div>
                                        <div className="w-4 h-1 bg-white/20 rounded-full"></div>
                                        <div className="w-4 h-1 bg-white/40 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.3)]"></div>
                                    </div>
                                </div>
                            </div>
                            
                            <h2 className="text-xs font-bold tracking-[0.2em] text-blue-400 uppercase mb-3">Administration & HM</h2>
                            <h1 className="text-4xl font-bold tracking-tight mb-2 text-white drop-shadow-sm">Physician & Health Portal</h1>
                            <p className="text-slate-400 text-lg font-medium tracking-wide">醫師排班、行政管理與健康管理系統</p>
                        </div>

                        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 md:p-8 shadow-xl">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">SELECT ACCOUNT TYPE</label>
                            <div className="relative group">
                                <select
                                    onChange={(e) => handleUserSelect(e.target.value)}
                                    value=""
                                    className="w-full appearance-none bg-navy-900/50 hover:bg-slate-900 border border-white/10 hover:border-blue-500/50 rounded-lg px-4 py-3.5 text-sm font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-300 cursor-pointer"
                                >
                                    <option value="" disabled>Select account to login...</option>
                                    <optgroup label="醫師與行政管理" className="text-slate-900 bg-white">
                                        {adminAndPhysicianUsers.map(user => (
                                            <option key={user.id} value={user.id}>{user.name} ({getRoleLabel(user.role)})</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="健康管理組" className="text-slate-900 bg-white">
                                        {hmUsers.map(user => (
                                            <option key={user.id} value={user.id}>{user.name} ({getRoleLabel(user.role)})</option>
                                        ))}
                                    </optgroup>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-blue-400 transition-colors">
                                    <ChevronDown size={18} />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Right Side: Radiology Portal (Light/Teal) */}
                <section className="relative bg-[#F8FAFC] p-6 md:p-16 flex flex-col justify-center border-l border-gray-100 overflow-hidden">
                    <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-teal-400/5 rounded-full blur-[80px] pointer-events-none"></div>
                    
                    <div className="relative z-10 w-full max-w-md mx-auto">
                        <div className="mb-8 md:mb-12">
                            {/* Graphic Sphere */}
                             <div className="relative w-20 h-20 mb-8 animate-float-delayed hidden md:block">
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-2 bg-teal-600/20 rounded-[100%] blur-sm translate-y-6"></div>
                                <div className="relative h-full w-full rounded-full glass-sphere flex items-center justify-center backdrop-blur-sm overflow-hidden border border-white bg-white/40">
                                    <div className="absolute top-[15%] left-[15%] w-[25%] h-[15%] bg-white/60 rounded-[100%] blur-[2px] rotate-[-45deg]"></div>
                                    <div className="relative z-10 w-10 h-10 flex items-center justify-center text-teal-600 drop-shadow-[0_0_5px_rgba(13,148,136,0.4)]">
                                        <Activity size={24} strokeWidth={2.5} />
                                    </div>
                                    <div className="absolute bottom-[10%] left-[20%] right-[20%] h-[20%] bg-teal-400/10 rounded-[100%] blur-md"></div>
                                </div>
                            </div>

                            <h2 className="text-xs font-bold tracking-[0.2em] text-teal-600 uppercase mb-3">Radiology Dept</h2>
                            <h1 className="text-4xl font-bold tracking-tight mb-2 text-slate-900">Medical Imaging Portal</h1>
                            <p className="text-slate-500 text-lg font-medium tracking-wide">影像醫學部排班系統</p>
                        </div>

                        <div className="bg-white rounded-xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative">
                             <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1">SELECT ACCOUNT TYPE</label>
                             <div className="relative group">
                                <select 
                                    onChange={(e) => handleUserSelect(e.target.value)}
                                    value=""
                                    className="w-full appearance-none bg-slate-50 hover:bg-white border border-slate-200 hover:border-teal-400 hover:shadow-[0_4px_20px_rgba(20,184,166,0.15)] rounded-lg px-4 py-3.5 text-sm font-medium text-slate-600 group-hover:text-teal-700 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-teal-200 cursor-pointer"
                                >
                                    <option value="" disabled>Select account to login...</option>
                                    <optgroup label="系統管理與主管">
                                         {radiologyPortalUsers.filter(u => u.role === UserRole.SYSTEM_ADMIN || u.role === UserRole.SUPERVISOR).map(user => (
                                            <option key={user.id} value={user.id}>
                                                {user.role === UserRole.SYSTEM_ADMIN ? '👑 ' : '⭐ '}
                                                {user.name} ({getRoleLabel(user.role)})
                                            </option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="放射師團隊">
                                        {radiologyPortalUsers.filter(u => 
                                            u.role === UserRole.RADIOGRAPHER_STAFF || 
                                            (u as any).role === 'EMPLOYEE' ||
                                            (u.isRadiographer && u.role !== UserRole.SUPERVISOR && u.role !== UserRole.SYSTEM_ADMIN)
                                        ).map(user => (
                                            <option key={user.id} value={user.id}>{user.name}</option>
                                        ))}
                                    </optgroup>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-teal-500 transition-colors">
                                    <ChevronDown size={18} />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Password Overlay */}
                {selectedUser && (
                     <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
                         <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-white/50 p-10 transform transition-all animate-in slide-in-from-bottom-4">
                             <div className="text-center mb-8">
                                    <div
                                        className="w-24 h-24 rounded-2xl flex items-center justify-center text-white font-bold text-4xl shadow-lg mx-auto mb-6 relative overflow-hidden"
                                        style={{ backgroundColor: selectedUser.color || '#9CA3AF' }}
                                    >
                                        <div className="absolute inset-0 bg-black/10 mix-blend-overlay"></div>
                                        <div className="relative z-10">{selectedUser.alias || selectedUser.name.charAt(0)}</div>
                                    </div>
                                    <h2 className="text-2xl font-bold text-slate-800">{selectedUser.name}</h2>
                                    <div className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-500">
                                        {getRoleIcon(selectedUser.role)} {getRoleLabel(selectedUser.role)}
                                    </div>
                             </div>

                             <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Enter Password</label>
                                    <div className="relative group">
                                        <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-100 focus:border-teal-400 outline-none transition-all font-bold text-slate-800 placeholder-slate-300 tracking-widest"
                                            placeholder="••••••"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="bg-red-50 text-red-500 text-sm font-bold p-3 rounded-lg text-center border border-red-100 flex items-center justify-center gap-2">
                                        <Shield size={14} /> {error}
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={handleBack}
                                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]"
                                    >
                                        返回
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-[2] flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                                    >
                                        <LogIn size={18} />
                                        登入系統
                                    </button>
                                </div>
                             </form>
                         </div>
                     </div>
                )}
            </main>

            <footer className="mt-8">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-400 tracking-widest uppercase">
                    <span>© 2026 Admin Portal</span>
                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                    <span>Medical Imaging Tech</span>
                </div>
            </footer>
        </div>
    );
};

export default LoginPage;
