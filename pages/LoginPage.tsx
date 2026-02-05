import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { db } from '../services/store';
import { LogIn, User as UserIcon, Lock, ChevronLeft, Shield, Calendar, Activity, Eye } from 'lucide-react';

interface LoginPageProps {
    onLogin: (user: User) => void;
}



const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
    const users = db.getUsers();
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    // Split users by role
    const physicianSideUsers = users.filter(u => 
        u.role === UserRole.SCHEDULER || u.role === UserRole.VIEWER
    );

    const radiographerSideUsers = users.filter(u => 
        u.role === UserRole.EMPLOYEE || 
        u.role === UserRole.SUPERVISOR || 
        u.role === UserRole.SYSTEM_ADMIN
    );

    const handleUserSelect = (userId: string) => {
        const user = users.find(u => u.id === userId);
        if (user) {
                // Removed direct login for viewer

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
            // Viewer can login directly (preset password 8686) without checking entered password
            // Removed direct login for viewer

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
            case UserRole.SUPERVISOR: return '主管';
            case UserRole.SYSTEM_ADMIN: return '管理員';
            case UserRole.SCHEDULER: return '排班管理';
            case UserRole.VIEWER: return '瀏覽者';
            default: return '放射師';
        }
    };

    const getRoleIcon = (role: UserRole) => {
         switch (role) {
            case UserRole.SUPERVISOR: return <Shield size={14} className="text-purple-500" />;
            case UserRole.SYSTEM_ADMIN: return <Shield size={14} className="text-gray-700" />;
            case UserRole.SCHEDULER: return <Calendar size={14} className="text-blue-500" />;
            case UserRole.VIEWER: return <Eye size={14} className="text-green-500" />;
            default: return <Activity size={14} className="text-teal-500" />;
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-gray-800 p-4 lg:p-8 font-sans relative">
            <main className="w-full max-w-6xl shadow-2xl rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 min-h-[700px] bg-white relative z-10">

                {/* Left Side: Physician Portal (Dark/Navy) */}
                <section className="relative pattern-geo text-white p-6 md:p-16 flex flex-col justify-center overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800">
                    <div className="absolute inset-0 bg-navy-900/90 pointer-events-none"></div>
                    <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"></div>
                    
                    <div className="relative z-10 w-full max-w-md mx-auto">
                        <div className="mb-8 md:mb-12">
                            {/* Graphic Block */}
                            <div className="relative w-20 h-20 mb-8 animate-float hidden md:block">
                                <div className="absolute inset-2 bg-blue-500 rounded-2xl blur-xl opacity-40"></div>
                                <div className="relative h-full w-full rounded-2xl glass-block flex flex-col items-center justify-center border-t border-l border-white/20 border-b border-r border-black/20">
                                    <div className="w-12 h-1.5 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full mb-2 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <div className="w-4 h-1 bg-white/20 rounded-full"></div>
                                        <div className="w-4 h-1 bg-white/20 rounded-full"></div>
                                        <div className="w-4 h-1 bg-white/20 rounded-full"></div>
                                        <div className="w-4 h-1 bg-white/40 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.3)]"></div>
                                    </div>
                                </div>
                            </div>
                            
                            <h2 className="text-xs font-bold tracking-[0.2em] text-blue-400 uppercase mb-3">Medical Staff</h2>
                            <h1 className="text-4xl font-bold tracking-tight mb-2 text-white drop-shadow-sm">Physician Portal</h1>
                            <p className="text-slate-400 text-lg font-light tracking-wide">醫師排班與管理</p>
                        </div>

                        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 md:p-8 shadow-xl">
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">Account Type</label>
                                    <div className="relative group">
                                        <select
                                            onChange={(e) => handleUserSelect(e.target.value)}
                                            value=""
                                            className="w-full appearance-none bg-navy-900/50 hover:bg-navy-800 border border-white/10 hover:border-blue-500/50 rounded-lg px-4 py-3.5 text-sm font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-300 cursor-pointer"
                                        >
                                            <option value="" disabled>Select account to login...</option>
                                            <optgroup label="排班管理員 (HR)" className="text-slate-900 bg-white">
                                                {physicianSideUsers.filter(u => u.role === UserRole.SCHEDULER).map(user => (
                                                    <option key={user.id} value={user.id}>{user.name} ({user.alias || user.name[0]})</option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="瀏覽者 (Viewer)" className="text-slate-900 bg-white">
                                                {physicianSideUsers.filter(u => u.role === UserRole.VIEWER).map(user => (
                                                    <option key={user.id} value={user.id}>{user.name} ({user.alias || user.name[0]})</option>
                                                ))}
                                            </optgroup>
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-blue-400 transition-colors">
                                            <ChevronLeft size={16} className="-rotate-90" />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 mb-3 font-medium ml-1">QUICK LOGIN</p>
                                    <div className="flex flex-wrap gap-2">
                                        <button className="px-4 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-blue-600 hover:border-blue-500 hover:shadow-[0_0_15px_rgba(37,99,235,0.4)] text-xs font-medium text-slate-300 hover:text-white transition-all duration-300 hover:-translate-y-0.5 cursor-default">
                                            HR System
                                        </button>
                                        <button className="px-4 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-blue-600 hover:border-blue-500 hover:shadow-[0_0_15px_rgba(37,99,235,0.4)] text-xs font-medium text-slate-300 hover:text-white transition-all duration-300 hover:-translate-y-0.5 cursor-default">
                                            Viewer Mode
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Right Side: Radiology Order (Light/Teal) */}
                <section className="relative bg-slate-50 p-6 md:p-16 flex flex-col justify-center border-l border-gray-100 overflow-hidden">
                    <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-teal-400/5 rounded-full blur-[80px] pointer-events-none"></div>
                    
                    <div className="relative z-10 w-full max-w-md mx-auto">
                        <div className="mb-8 md:mb-12">
                            {/* Graphic Sphere */}
                             <div className="relative w-20 h-20 mb-8 animate-float-delayed hidden md:block">
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-2 bg-teal-600/20 rounded-[100%] blur-sm translate-y-6"></div>
                                <div className="relative h-full w-full rounded-full glass-sphere flex items-center justify-center backdrop-blur-sm overflow-hidden border border-white/40">
                                    <div className="absolute top-[15%] left-[15%] w-[25%] h-[15%] bg-white/60 rounded-[100%] blur-[2px] rotate-[-45deg]"></div>
                                    <div className="relative z-10 w-10 h-10 flex items-center justify-center text-teal-600 drop-shadow-[0_0_5px_rgba(13,148,136,0.4)]">
                                        <Activity size={24} strokeWidth={2.5} />
                                    </div>
                                    <div className="absolute bottom-[10%] left-[20%] right-[20%] h-[20%] bg-teal-400/10 rounded-[100%] blur-md"></div>
                                </div>
                            </div>

                            <h2 className="text-xs font-bold tracking-[0.2em] text-teal-600 uppercase mb-3">Medical Imaging Dept</h2>
                            <h1 className="text-4xl font-bold tracking-tight mb-2 text-slate-900">Medical Imaging Portal</h1>
                            <p className="text-slate-500 text-lg font-light tracking-wide">影像醫學部排班系統</p>
                        </div>

                        <div className="bg-white rounded-xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative">
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">Account Type</label>
                                    <div className="relative group">
                                         <select 
                                            onChange={(e) => handleUserSelect(e.target.value)}
                                            value=""
                                            className="w-full appearance-none bg-slate-50 hover:bg-white border border-slate-200 hover:border-teal-400 hover:shadow-[0_4px_20px_rgba(20,184,166,0.15)] rounded-lg px-4 py-3.5 text-sm font-medium text-slate-600 group-hover:text-teal-700 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-teal-200 cursor-pointer"
                                        >
                                            <option value="" disabled>Select account to login...</option>
                                            <optgroup label="系統管理與主管">
                                                 {radiographerSideUsers.filter(u => u.role === UserRole.SYSTEM_ADMIN || u.role === UserRole.SUPERVISOR).map(user => (
                                                    <option key={user.id} value={user.id}>
                                                        {user.role === UserRole.SYSTEM_ADMIN ? '👑 ' : '⭐ '}
                                                        {user.name}
                                                    </option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="放射師">
                                                {radiographerSideUsers.filter(u => u.role === UserRole.EMPLOYEE).map(user => (
                                                    <option key={user.id} value={user.id}>{user.name}</option>
                                                ))}
                                            </optgroup>
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-teal-500 transition-colors">
                                            <ChevronLeft size={16} className="-rotate-90" />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 mb-3 font-medium ml-1">QUICK LOGIN</p>
                                    <div className="flex flex-wrap gap-2">
                                        <button className="px-4 py-1.5 rounded-full border border-slate-200 bg-white hover:border-teal-500 hover:text-white hover:bg-teal-500 hover:shadow-[0_2px_10px_rgba(20,184,166,0.3)] text-xs font-medium text-slate-500 transition-all duration-300 hover:-translate-y-0.5 cursor-default">
                                            Admin
                                        </button>
                                        <button className="px-4 py-1.5 rounded-full border border-slate-200 bg-white hover:border-teal-500 hover:text-white hover:bg-teal-500 hover:shadow-[0_2px_10px_rgba(20,184,166,0.3)] text-xs font-medium text-slate-500 transition-all duration-300 hover:-translate-y-0.5 cursor-default">
                                            Manager
                                        </button>
                                        <button className="px-4 py-1.5 rounded-full border border-slate-200 bg-white hover:border-teal-500 hover:text-white hover:bg-teal-500 hover:shadow-[0_2px_10px_rgba(20,184,166,0.3)] text-xs font-medium text-slate-500 transition-all duration-300 hover:-translate-y-0.5 cursor-default">
                                            Staff
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="absolute top-8 right-8">
                            <button className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-full shadow-sm hover:shadow-md hover:border-teal-200 transition-all text-xs font-semibold text-slate-600 group">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                                </span>
                                System Status
                            </button>
                        </div>
                    </div>
                </section>

                {/* Password Overlay (When Selected) */}
                {selectedUser && (
                     <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-xl flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-300">
                         <button
                            onClick={handleBack}
                            className="absolute top-8 left-8 flex items-center text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm hover:shadow-md"
                        >
                            <ChevronLeft size={18} className="mr-1" />
                            返回選擇
                        </button>

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
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                                    <div className="relative group">
                                        <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-100 focus:border-teal-400 outline-none transition-all font-bold text-slate-800 placeholder-slate-300"
                                            placeholder="輸入密碼..."
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="bg-red-50 text-red-500 text-sm font-bold p-3 rounded-lg text-center animate-pulse border border-red-100 flex items-center justify-center gap-2">
                                        <Shield size={14} /> {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
                                >
                                    <LogIn size={18} />
                                    登入系統
                                </button>
                             </form>
                         </div>
                     </div>
                )}
            </main>

            <footer className="mt-8">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
                    <span>© 2026 Penny Liu. All rights reserved.</span>
                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                    <span>Build 2.0</span>
                </div>
            </footer>
        </div>
    );
};

export default LoginPage;
