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
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 font-sans">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex overflow-hidden border border-white/50 relative min-h-[600px]">
                
                {/* Global Info / Biometric (Top Right Absolute) */}
                 {isBiometricAvailable && !selectedUser && (
                    <div className="absolute top-6 right-6 z-20">
                         <button 
                            onClick={handleBiometricLogin}
                            className="bg-white/80 hover:bg-white backdrop-blur-sm text-slate-600 px-4 py-2 rounded-full text-sm font-bold shadow-sm border border-slate-100 flex items-center gap-2 transition-all hover:scale-105"
                        >
                            <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></div>
                            快速登入
                        </button>
                    </div>
                )}

                {/* Back Button (Absolute) */}
                {selectedUser && (
                     <button
                        onClick={handleBack}
                        className="absolute top-6 left-6 z-20 flex items-center text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors bg-white/80 px-3 py-1.5 rounded-full backdrop-blur-sm border border-slate-100 shadow-sm"
                    >
                        <ChevronLeft size={16} className="mr-1" />
                        返回選擇
                    </button>
                )}

                {/* Split Layout */}
                {!selectedUser ? (
                    <div className="flex flex-col md:flex-row w-full animate-in fade-in duration-500">
                        
                        {/* Left Side: Physician & HR */}
                        <div className="w-full md:w-1/2 bg-gradient-to-br from-blue-50 to-indigo-50 p-10 flex flex-col justify-center border-b md:border-b-0 md:border-r border-indigo-100 relative overflow-hidden group">
                           <div className="absolute top-0 right-0 w-64 h-64 bg-blue-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                           
                           <div className="relative z-10 max-w-md mx-auto w-full">
                                <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 mb-6 shadow-sm group-hover:scale-110 transition-transform duration-500">
                                    <Calendar size={28} />
                                </div>
                                <h2 className="text-2xl font-bold text-slate-800 mb-2">醫師排班與管理</h2>
                                <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                                    提供排班管理員 (HR) 排班操作，<br/>以及一般使用者查詢醫師班表。
                                </p>

                                <div className="space-y-4">
                                    <div className="relative">
                                        <select 
                                            onChange={(e) => handleUserSelect(e.target.value)}
                                            value=""
                                            className="w-full pl-4 pr-10 py-4 bg-white border-2 border-indigo-100 hover:border-indigo-300 rounded-xl text-slate-700 font-bold outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 transition-all appearance-none cursor-pointer"
                                        >
                                            <option value="" disabled>請選擇帳號登入...</option>
                                            <optgroup label="排班管理員 (HR)">
                                                {physicianSideUsers.filter(u => u.role === UserRole.SCHEDULER).map(user => (
                                                    <option key={user.id} value={user.id}>{user.name} ({user.alias || user.name[0]})</option>
                                                ))}
                                            </optgroup>
                                             <optgroup label="瀏覽者 (Viewer)">
                                                {physicianSideUsers.filter(u => u.role === UserRole.VIEWER).map(user => (
                                                    <option key={user.id} value={user.id}>{user.name} ({user.alias || user.name[0]})</option>
                                                ))}
                                            </optgroup>
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none">
                                            <ChevronLeft size={20} className="-rotate-90" />
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-center">
                                       <span className="text-xs font-bold text-indigo-300 px-2 py-1 bg-indigo-50 rounded-lg">HR</span>
                                       <span className="text-xs font-bold text-indigo-300 px-2 py-1 bg-indigo-50 rounded-lg">Viewer</span>
                                    </div>
                                </div>
                           </div>
                        </div>

                        {/* Right Side: Radiographer */}
                        <div className="w-full md:w-1/2 bg-white p-10 flex flex-col justify-center relative overflow-hidden group">
                            <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-50 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>

                            <div className="relative z-10 max-w-md mx-auto w-full">
                                <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center text-teal-600 mb-6 shadow-sm group-hover:scale-110 transition-transform duration-500">
                                    <Activity size={28} />
                                </div>
                                <h2 className="text-2xl font-bold text-slate-800 mb-2">放射科排班系統</h2>
                                <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                                    放射師、部門主管及系統管理員入口。<br/>管理檢查排程與人員調度。
                                </p>

                                <div className="space-y-4">
                                    <div className="relative">
                                         <select 
                                            onChange={(e) => handleUserSelect(e.target.value)}
                                            value=""
                                            className="w-full pl-4 pr-10 py-4 bg-slate-50 border-2 border-slate-100 hover:border-teal-300 rounded-xl text-slate-700 font-bold outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all appearance-none cursor-pointer"
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
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-teal-500 pointer-events-none">
                                            <ChevronLeft size={20} className="-rotate-90" />
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-center">
                                       <span className="text-xs font-bold text-slate-300 px-2 py-1 bg-slate-50 rounded-lg">Admin</span>
                                       <span className="text-xs font-bold text-slate-300 px-2 py-1 bg-slate-50 rounded-lg">Manager</span>
                                       <span className="text-xs font-bold text-slate-300 px-2 py-1 bg-slate-50 rounded-lg">Staff</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                ) : (
                    // Login Form Overlay (Centered)
                    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-300 bg-white">
                         <div className="text-center mb-8">
                                <div
                                    className="w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-3xl shadow-xl ring-4 ring-slate-50 mx-auto mb-4 relative"
                                    style={{ backgroundColor: selectedUser.color || '#9CA3AF' }}
                                >
                                    {selectedUser.alias || selectedUser.name.charAt(0)}
                                    <div className="absolute -bottom-2 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-100 flex items-center gap-1">
                                        {getRoleIcon(selectedUser.role)}
                                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{getRoleLabel(selectedUser.role)}</span>
                                    </div>
                                </div>
                                <h2 className="text-2xl font-bold text-slate-800 mt-6">{selectedUser.name}</h2>
                                <p className="text-slate-400 text-sm mt-1">請輸入密碼以繼續</p>
                         </div>

                         <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
                                <div className="relative group">
                                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-500 transition-colors" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-teal-50 focus:border-teal-500 outline-none transition-all bg-slate-50 focus:bg-white font-medium"
                                        placeholder="輸入密碼..."
                                        autoFocus
                                    />
                                </div>

                                {error && (
                                    <div className="bg-red-50 text-red-500 text-xs font-bold p-3 rounded-lg text-center animate-pulse border border-red-100">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-slate-200 active:scale-[0.98] mt-2"
                                >
                                    <LogIn size={20} />
                                    確認登入
                                </button>
                         </form>
                    </div>
                )}
            </div>
            
            {/* Copyright Footer */}
            <div className="fixed bottom-4 text-center w-full pointer-events-none">
                <span className="text-[10px] text-slate-400 font-medium bg-white/50 px-2 py-1 rounded-full backdrop-blur-sm">
                    © 2026 Penny Liu. All rights reserved.
                </span>
            </div>
        </div>
    );
};

export default LoginPage;
