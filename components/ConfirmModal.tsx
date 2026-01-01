
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  confirmColor?: 'red' | 'teal' | 'purple';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen, onClose, onConfirm, title, message, confirmText = '確定', confirmColor = 'teal'
}) => {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 border border-gray-100 scale-100 animate-in zoom-in-95 duration-200 relative">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100 disabled:opacity-50"
        >
          <X size={20} />
        </button>

        <div className="flex items-start gap-4 mb-4">
          <div className={`p-3 rounded-full shrink-0 ${confirmColor === 'red' ? 'bg-red-50 text-red-600' :
              confirmColor === 'purple' ? 'bg-purple-50 text-purple-600' :
                'bg-teal-50 text-teal-600'
            }`}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 leading-tight mb-2">{title}</h3>
            <div className="text-sm text-gray-500 leading-relaxed">
              {message}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2.5 text-white rounded-lg font-bold text-sm shadow-sm transition-colors flex justify-center items-center gap-2 ${confirmColor === 'red'
                ? 'bg-red-600 hover:bg-red-700 shadow-red-200'
                : (confirmColor === 'purple' ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-200' : 'bg-teal-600 hover:bg-teal-700 shadow-teal-200')
              } disabled:opacity-70 disabled:cursor-not-allowed`}
          >
            {isLoading ? '處理中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
