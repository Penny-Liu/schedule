import React, { useState } from 'react';
import { User } from '../types';
import { db } from '../services/store';
import { Lock, Check, AlertTriangle, LogOut, CheckCircle2 } from 'lucide-react';
import {
    DEFAULT_PASSWORD,
    getPasswordPolicyErrorsForRole,
    MIN_PASSWORD_LENGTH,
    MIN_PUBLIC_VIEWER_PASSWORD_LENGTH,
    PUBLIC_VIEWER_ROLE,
} from '../services/passwordPolicy.mjs';

interface ChangePasswordPageProps {
    currentUser: User;
    onPasswordChanged: (updatedUser: User) => void;
    onLogout: () => void;
}

const ChangePasswordPage: React.FC<ChangePasswordPageProps> = ({ currentUser, onPasswordChanged, onLogout }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const isPublicViewer = currentUser.role === PUBLIC_VIEWER_ROLE;
    const minimumLength = isPublicViewer ? MIN_PUBLIC_VIEWER_PASSWORD_LENGTH : MIN_PASSWORD_LENGTH;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const passwordErrors = getPasswordPolicyErrorsForRole(newPassword, currentUser.role);
        if (passwordErrors.length > 0) {
            setError(passwordErrors[0]);
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('兩次輸入的密碼不一致');
            return;
        }

        if (newPassword === DEFAULT_PASSWORD && !isPublicViewer) {
            setError('新密碼不能與預設密碼相同');
            return;
        }

        setIsSubmitting(true);
        try {
            await db.updateUserPassword(currentUser.id, newPassword);

            // Update local user object manually to reflect change immediately in UI logic
            const updatedUser = { ...currentUser, mustChangePassword: false, password: newPassword };

            setSuccess(true);

            // Short delay to show success animation
            setTimeout(() => {
                onPasswordChanged(updatedUser);
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : '更新失敗，請稍後再試');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">

                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white text-center">
                    <div className="mb-4 bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto backdrop-blur-sm">
                        <Lock size={32} />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">請更新密碼</h1>
                    <p className="text-white/90 text-sm">
                        為了您的帳號安全與系統升級<br />請設定一組符合規則的新密碼
                    </p>
                </div>

                {/* Content */}
                <div className="p-8">
                    {success ? (
                        <div className="text-center py-8 animate-in fade-in zoom-in duration-300">
                            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 size={40} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">密碼更新成功！</h3>
                            <p className="text-gray-500">正在進入系統...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">

                            <div className="bg-blue-50 p-4 rounded-xl flex gap-3 text-sm text-blue-700">
                                <AlertTriangle size={20} className="shrink-0" />
                                <p>
                                    親愛的 {currentUser.name}，目前使用空白或預設密碼 <strong>{DEFAULT_PASSWORD}</strong>。
                                    請設定個人密碼，修改完成後即可繼續使用系統。
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">新密碼</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                                        placeholder="請輸入新密碼"
                                        minLength={minimumLength}
                                        autoComplete="new-password"
                                        autoFocus
                                    />
                                    <p className="mt-1.5 text-xs text-gray-500">
                                        {isPublicViewer
                                            ? `公用瀏覽帳號至少 ${MIN_PUBLIC_VIEWER_PASSWORD_LENGTH} 個字元。`
                                            : `至少 ${MIN_PASSWORD_LENGTH} 個字元，並包含文字與數字；請勿使用常見密碼。`}
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">確認新密碼</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                                        placeholder="再次輸入新密碼"
                                        minLength={minimumLength}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="text-red-500 text-sm font-medium text-center bg-red-50 py-2 rounded-lg">
                                    {error}
                                </div>
                            )}

                            <div className="pt-2 flex flex-col gap-3">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-gray-900 hover:bg-black text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-gray-200 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? '更新中...' : '確認變更'}
                                </button>

                                <button
                                    type="button"
                                    onClick={onLogout}
                                    className="w-full text-gray-400 hover:text-gray-600 font-medium py-2 transition-colors flex items-center justify-center gap-2 text-sm"
                                >
                                    <LogOut size={16} />
                                    登出並切換帳號
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChangePasswordPage;
