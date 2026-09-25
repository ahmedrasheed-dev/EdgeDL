import React from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        let Icon = CheckCircle;
        let borderClass = 'border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-[#121215] to-[#121215]';
        let iconBgClass = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';

        if (toast.type === 'error') {
          Icon = AlertTriangle;
          borderClass = 'border-rose-500/40 bg-gradient-to-r from-rose-950/40 via-[#121215] to-[#121215]';
          iconBgClass = 'bg-rose-500/20 text-rose-400 border-rose-500/30';
        } else if (toast.type === 'info') {
          Icon = Info;
          borderClass = 'border-blue-500/40 bg-gradient-to-r from-blue-950/40 via-[#121215] to-[#121215]';
          iconBgClass = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto border rounded-xl p-3.5 shadow-2xl shadow-black/80 backdrop-blur-md flex items-start gap-3 transition-all animate-in slide-in-from-bottom-5 duration-200 ${borderClass}`}
          >
            <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${iconBgClass}`}>
              <Icon size={16} />
            </div>
            <div className="flex-1 min-w-0 pr-1">
              <h4 className="text-xs font-bold text-white leading-tight">{toast.title}</h4>
              <p className="text-[11px] text-zinc-300 mt-0.5 leading-snug line-clamp-2">{toast.message}</p>
            </div>
            <button
              className="text-zinc-500 hover:text-white p-1 rounded-md transition-colors shrink-0 cursor-pointer"
              onClick={() => onDismiss(toast.id)}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
