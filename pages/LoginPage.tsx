
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { db } from '../services/store';
import { LogIn, ArrowRight, User as UserIcon, Lock, ChevronLeft } from 'lucide-react';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const users = db.getUsers();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleUserSelect = (user: User) => {
      setSelectedUser(user);
      setPassword('');
      setError('');
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
        } else {
            setError('密碼錯誤，請重試');
        }
    }
  };

  const getRoleLabel = (role: UserRole) => {
      switch(role) {
          case UserRole.SUPERVISOR: return '主管';
          case UserRole.SYSTEM_ADMIN: return '管理員';
          default: return '放射師';
      }
  };

  const getRoleColor = (role: UserRole) => {
      switch(role) {
          case UserRole.SUPERVISOR: return 'bg-purple-100 text-purple-700 border-purple-200';
          case UserRole.SYSTEM_ADMIN: return 'bg-gray-800 text-white border-gray-900';
          default: return 'bg-blue-50 text-blue-700 border-blue-100';
      }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-gray-200 p-4 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex overflow-hidden border border-white/50 relative">
        
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-50 rounded-full mix-blend-multiply filter blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-50 rounded-full mix-blend-multiply filter blur-3xl opacity-50 translate-y-1/2 -translate-x-1/2"></div>

        {/* Left Side: Brand Info */}
        <div className="hidden md:flex flex-col justify-between w-2/5 bg-slate-50 p-12 border-r border-slate-100 z-10">
           <div>
              <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-teal-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-teal-200 mb-6">
                影
              </div>
              <h1 className="text-3xl font-bold text-slate-800 tracking-tight leading-tight">
                影像醫學部<br/>排班管理系統
              </h1>
              <p className="mt-4 text-slate-500 text-sm leading-relaxed">
                現代化的醫療人員排班解決方案。<br/>
                輕鬆管理輪班、請假與人力調度。
              </p>
           </div>
           <div className="text-xs text-slate-400 font-medium">
              © 2024 Radiology Dept.
           </div>
        </div>

        {/* Right Side: Interaction Area */}
        <div className="w-full md:w-3/5 p-8 md:p-12 flex flex-col justify-center relative z-10">
          
          {!selectedUser ? (
             // Step 1: User Selection Grid
             <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">選擇使用者</h2>
                    <p className="text-slate-500 text-sm">請點擊您的帳號以繼續登入</p>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {users.map(user => (
                        <button
                            key={user.id}
                            onClick={() => handleUserSelect(user)}
                            className="flex flex-col items-center p-4 rounded-xl border border-slate-200 hover:border-teal-400 hover:shadow-md hover:bg-teal-50/30 transition-all group bg-white"
                        >
                            <div 
                                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm mb-3 group-hover:scale-110 transition-transform"
                                style={{ backgroundColor: user.color || '#9CA3AF' }}
                            >
                                {user.alias || user.name.charAt(0)}
                            </div>
                            <div className="text-sm font-bold text-slate-800 mb-1">{user.name}</div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${getRoleColor(user.role)}`}>
                                {getRoleLabel(user.role)}
                            </span>
                        </button>
                    ))}
                </div>
             </div>
          ) : (
             // Step 2: Password Input
             <div className="animate-in fade-in slide-in-from-right-4 duration-300 max-w-sm mx-auto w-full">
                <button 
                    onClick={handleBack}
                    className="flex items-center text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors group"
                >
                    <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    返回選擇人員
                </button>

                <div className="text-center mb-8">
                     <div 
                        className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-3xl shadow-lg ring-4 ring-white mx-auto mb-4"
                        style={{ backgroundColor: selectedUser.color || '#9CA3AF' }}
                    >
                        {selectedUser.alias || selectedUser.name.charAt(0)}
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">{selectedUser.name}</h2>
                    <p className="text-slate-500 text-sm font-medium mt-1">{getRoleLabel(selectedUser.role)}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <div className="relative">
                            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all bg-slate-50 focus:bg-white"
                                placeholder="請輸入密碼"
                                autoFocus
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 text-xs font-bold p-3 rounded-lg text-center animate-pulse">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-teal-200 hover:shadow-teal-300 active:scale-[0.98]"
                    >
                        <LogIn size={20} />
                        確認登入
                    </button>
                </form>
             </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default LoginPage;
