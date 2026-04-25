import { useEffect } from 'react';
import { X, Mail } from 'lucide-react';

export interface ToastData {
  id: string;
  title?: string;
  snippet?: string;
  avatar?: string;
  senderInitial?: string;
  emailId?: string;
  type?: 'success' | 'error' | 'info';
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
  onClick: (emailId: string) => void;
}

export function ToastContainer({ toasts, onDismiss, onClick }: ToastProps) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="relative pointer-events-auto bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-80 overflow-hidden animate-slide-in"
        >
          <button
            onClick={() => onDismiss(toast.id)}
            className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {toast.message ? (
            <div className={`p-4 pr-10 flex items-center gap-3 text-sm ${
              toast.type === 'error' ? 'text-red-400' :
              toast.type === 'success' ? 'text-green-400' :
              'text-zinc-300'
            }`}>
              <span className="flex-1 min-w-0">{toast.message}</span>
              {toast.actionLabel && toast.onAction && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toast.onAction?.();
                    onDismiss(toast.id);
                  }}
                  className="shrink-0 rounded-lg border border-violet-500/40 px-3 py-1 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 transition-colors"
                >
                  {toast.actionLabel}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => onClick(toast.emailId ?? '')}
              className="w-full text-left p-4 hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {toast.avatar ? (
                    <img
                      src={toast.avatar}
                      alt=""
                      className="w-10 h-10 rounded-full bg-zinc-700"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                      {toast.senderInitial || <Mail className="w-5 h-5" />}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pr-6">
                  <p className="text-zinc-100 font-semibold text-sm mb-1 truncate">
                    {toast.title}
                  </p>
                  <p className="text-zinc-500 text-xs truncate">
                    {toast.snippet}
                  </p>
                </div>
              </div>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
