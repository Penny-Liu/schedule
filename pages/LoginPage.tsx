import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { db } from '../services/store';
import { LogIn, User as UserIcon, Lock, ChevronLeft, Shield, Calendar, Activity, Eye } from 'lucide-react';

interface LoginPageProps {
    onLogin: (user: User) => void;
}

declare global {
    interface Window {
        Capacitor: any;
    }
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
            if (user.role === UserRole.VIEWER) {
                // Direct login for viewer without password prompt (preset password 8686)
                onLogin(user);
                localStorage.setItem('last_user_id', user.id);
                return;
            }
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
            if (selectedUser.role === UserRole.VIEWER) {
                onLogin(selectedUser);
                localStorage.setItem('last_user_id', selectedUser.id);
                return;
            }
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

    // --- Biometric Logic ---
    const [isBiometricAvailable, setIsBiometricAvailable] = React.useState(false);

    React.useEffect(() => {
        const checkBiometric = async () => {
            if (window.Capacitor) {
                 try {
                    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
                    const result = await NativeBiometric.isAvailable();
                    if (result.isAvailable) {
                        setIsBiometricAvailable(true);
                    }
                 } catch (e) {
                     console.log('Biometric not available:', e);
                 }
            }
        };
        checkBiometric();
    }, []);

    const handleBiometricLogin = async () => {
        const lastUserId = localStorage.getItem('last_user_id');
        if (!lastUserId) {
            setError('請先使用密碼登入一次，以啟用快速登入');
            return;
        }

        try {
            const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
            await NativeBiometric.verifyIdentity({
                reason: '使用 Face ID / Touch ID 登入排班系統',
                title: '快速登入',
                subtitle: '驗證您的身份',
                description: '請使用 Face ID 或 Touch ID'
            });

            const user = users.find(u => u.id === lastUserId);
            if (user) {
                onLogin(user);
            } else {
                setError('找不到上一次的使用者紀錄');
            }
        } catch (e) {
            console.error('Biometric failed:', e);
            setError('驗證失敗');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4 font-sans relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-200/30 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-teal-200/30 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            <div className="bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] w-full max-w-6xl flex overflow-hidden border border-white/50 relative min-h-[580px] z-10 transition-all duration-700">
                
                {/* Global Info / Biometric (Top Right Absolute) */}
                 {isBiometricAvailable && !selectedUser && (
                    <div className="absolute top-8 right-8 z-30">
                         <button 
                            onClick={handleBiometricLogin}
                            className="bg-white/90 hover:bg-white backdrop-blur-md text-slate-600 px-5 py-2.5 rounded-full text-sm font-bold shadow-sm border border-slate-100 flex items-center gap-2 transition-all hover:scale-105 hover:shadow-md group"
                        >
                            <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse group-hover:bg-teal-400"></div>
                            快速登入
                        </button>
                    </div>
                )}

                {/* Back Button (Absolute) */}
                {selectedUser && (
                     <button
                        onClick={handleBack}
                        className="absolute top-8 left-8 z-30 flex items-center text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors bg-white/80 px-4 py-2 rounded-full backdrop-blur-md border border-slate-100 shadow-sm hover:shadow-md"
                    >
                        <ChevronLeft size={18} className="mr-1" />
                        返回選擇
                    </button>
                )}

                {/* Split Layout */}
                {!selectedUser ? (
                    <div className="flex flex-col md:flex-row w-full animate-in fade-in duration-700">
                        
                        {/* Left Side: Physician & HR (Dark/Premium Theme) */}
                        <div className="w-full md:w-1/2 bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4338ca] p-10 lg:p-14 flex flex-col justify-center relative overflow-hidden group border-b md:border-b-0 md:border-r border-indigo-900/30">
                           {/* Decoration */}
                           <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none mix-blend-overlay"></div>
                           <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3 pointer-events-none mix-blend-overlay"></div>
                           
                           <div className="relative z-10 max-w-md mx-auto w-full">
                                <div className="w-14 h-14 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center text-indigo-100 mb-6 shadow-inner border border-white/10 group-hover:scale-110 transition-transform duration-500 group-hover:bg-white/20">
                                    <Calendar size={28} />
                                </div>
                                <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">醫師排班與管理</h2>
                                <p className="text-indigo-200 text-sm mb-8 leading-relaxed font-medium">
                                    專為排班管理員 (HR) 與醫師設計。<br/>輕鬆管理班表，即時掌握人力調度。
                                </p>

                                <div className="space-y-6">
                                    <div className="relative group/select">
                                        <select 
                                            onChange={(e) => handleUserSelect(e.target.value)}
                                            value=""
                                            className="w-full pl-5 pr-12 py-5 bg-white/5 hover:bg-white/10 border border-indigo-400/30 hover:border-indigo-300/50 rounded-2xl text-indigo-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all appearance-none cursor-pointer backdrop-blur-md placeholder-indigo-300"
                                        >
                                            <option value="" disabled className="text-slate-400">請選擇帳號登入...</option>
                                            <optgroup label="排班管理員 (HR)" className="text-slate-800 font-bold">
                                                {physicianSideUsers.filter(u => u.role === UserRole.SCHEDULER).map(user => (
                                                    <option key={user.id} value={user.id} className="text-slate-600 font-medium py-2">{user.name} ({user.alias || user.name[0]})</option>
                                                ))}
                                            </optgroup>
                                             <optgroup label="瀏覽者 (Viewer)" className="text-slate-800 font-bold">
                                                {physicianSideUsers.filter(u => u.role === UserRole.VIEWER).map(user => (
                                                    <option key={user.id} value={user.id} className="text-slate-600 font-medium py-2">{user.name} ({user.alias || user.name[0]})</option>
                                                ))}
                                            </optgroup>
                                        </select>
                                        <div className="absolute right-5 top-1/2 -translate-y-1/2 text-indigo-300 pointer-events-none transition-transform duration-300 group-hover/select:translate-x-1">
                                            <ChevronLeft size={20} className="-rotate-180" />
                                        </div>
                                    </div>
                                    <div className="flex gap-3 justify-start opacity-60">
                                       <span className="text-[10px] font-bold text-indigo-200 px-3 py-1 bg-white/10 rounded-full border border-white/5">HR System</span>
                                       <span className="text-[10px] font-bold text-indigo-200 px-3 py-1 bg-white/10 rounded-full border border-white/5">Viewer Mode</span>
                                    </div>
                                </div>
                           </div>
                        </div>

                        {/* Right Side: Radiographer (Clean/Medical Theme) */}
                        <div className="w-full md:w-1/2 bg-gradient-to-br from-[#f0f9ff] via-[#e6fffa] to-[#ccfbf1] p-10 lg:p-14 flex flex-col justify-center relative overflow-hidden group">
                            {/* Decoration */}
                            <div className="absolute top-0 right-0 w-96 h-96 bg-teal-200/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none mix-blend-multiply"></div>
                            
                            <div className="relative z-10 max-w-md mx-auto w-full">
                                <div className="w-14 h-14 bg-teal-100 rounded-2xl flex items-center justify-center text-teal-600 mb-6 shadow-sm group-hover:scale-110 transition-transform duration-500 group-hover:bg-teal-200/50">
                                    <Activity size={28} />
                                </div>
                                <h2 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">放射科排班系統</h2>
                                <p className="text-slate-500 text-sm mb-8 leading-relaxed font-medium">
                                    放射師、部門主管及系統管理員入口。<br/>高效管理檢查排程，優化工作流程。
                                </p>

                                <div className="space-y-6">
                                    <div className="relative group/select">
                                         <select 
                                            onChange={(e) => handleUserSelect(e.target.value)}
                                            value=""
                                            className="w-full pl-5 pr-12 py-5 bg-white border border-slate-200 hover:border-teal-300 rounded-2xl text-slate-700 font-bold outline-none focus:ring-4 focus:ring-teal-100 focus:border-teal-400 transition-all appearance-none cursor-pointer shadow-sm hover:shadow-md"
                                        >
                                            <option value="" disabled>請選擇帳號登入...</option>
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
                                        <div className="absolute right-5 top-1/2 -translate-y-1/2 text-teal-500 pointer-events-none transition-transform duration-300 group-hover/select:translate-x-1">
                                            <ChevronLeft size={20} className="-rotate-180" />
                                        </div>
                                    </div>
                                    <div className="flex gap-3 justify-start opacity-70">
                                       <span className="text-[10px] font-bold text-slate-400 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">Admin</span>
                                       <span className="text-[10px] font-bold text-slate-400 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">Manager</span>
                                       <span className="text-[10px] font-bold text-slate-400 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">Staff</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                ) : (
                    // Login Form Overlay (Centered)
                    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-500 bg-white/60 backdrop-blur-xl w-full h-full absolute top-0 left-0 z-20">
                         <div className="text-center mb-10 transform transition-all hover:scale-105 duration-500">
                                <div
                                    className="w-28 h-28 rounded-3xl flex items-center justify-center text-white font-bold text-4xl shadow-2xl ring-8 ring-white/50 mx-auto mb-6 relative overflow-hidden"
                                    style={{ backgroundColor: selectedUser.color || '#9CA3AF' }}
                                >
                                    <div className="absolute inset-0 bg-black/10 mix-blend-overlay"></div>
                                    <div className="relative z-10">{selectedUser.alias || selectedUser.name.charAt(0)}</div>
                                    
                                    <div className="absolute -bottom-1 -right-1 p-2 bg-white rounded-tl-2xl shadow-lg">
                                        {getRoleIcon(selectedUser.role)}
                                    </div>
                                </div>
                                <h2 className="text-3xl font-extrabold text-slate-800 mt-6 tracking-tight">{selectedUser.name}</h2>
                                <div className="flex items-center justify-center gap-2 mt-2">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                                        {getRoleLabel(selectedUser.role)}
                                    </span>
                                </div>
                         </div>

                         <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6 bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                                <div className="text-left">
                                    <label className="text-xs font-bold text-slate-400 ml-1 mb-1.5 block uppercase tracking-wider">Password</label>
                                    <div className="relative group">
                                        <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 focus:ring-4 focus:ring-teal-50 focus:border-teal-400 outline-none transition-all bg-slate-50 focus:bg-white font-bold text-slate-800 placeholder-slate-300 text-lg"
                                            placeholder="請輸入密碼..."
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="bg-red-50 text-red-500 text-sm font-bold p-4 rounded-xl text-center animate-pulse border border-red-100 flex items-center justify-center gap-2">
                                        <Shield size={16} />
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-xl shadow-slate-200 hover:shadow-2xl hover:-translate-y-0.5 active:scale-[0.98] mt-4 text-lg"
                                >
                                    <LogIn size={20} />
                                    登入系統
                                </button>
                         </form>
                    </div>
                )}
            </div>
            
            {/* Copyright Footer */}
            <div className="fixed bottom-6 text-center w-full pointer-events-none">
                <span className="text-[10px] text-slate-400 font-medium bg-white/60 px-4 py-2 rounded-full backdrop-blur-md shadow-sm border border-white/20">
                    © 2026 Penny Liu. All rights reserved. • Build 2.0
                </span>
            </div>
        </div>
    );
};

export default LoginPage;
