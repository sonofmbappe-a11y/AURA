import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface AuraModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: string;
  accentColor?: 'emerald' | 'sky' | 'violet' | 'amber';
  maxWidthClass?: string;
  children: React.ReactNode;
}

const ACCENT_BORDER: Record<NonNullable<AuraModalProps['accentColor']>, string> = {
  emerald: 'border-cyan-500/40',
  sky: 'border-cyan-500/40',
  violet: 'border-violet-500/40',
  amber: 'border-amber-500/45'
};

const ACCENT_BADGE: Record<NonNullable<AuraModalProps['accentColor']>, string> = {
  emerald: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  sky: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
};

export const AuraModal: React.FC<AuraModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  badge,
  accentColor = 'sky',
  maxWidthClass = 'max-w-md',
  children
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-slate-950/85 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`aura-glass rounded-xl w-full ${maxWidthClass} max-h-[88dvh] flex flex-col border ${ACCENT_BORDER[accentColor]} shadow-2xl my-auto overflow-hidden`}
      >
        <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 space-y-1">
            {badge && (
              <span
                className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${ACCENT_BADGE[accentColor]}`}
              >
                {badge}
              </span>
            )}
            <h3 className="font-bold text-base sm:text-lg leading-snug">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 leading-relaxed">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 flex items-center justify-center shrink-0 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3.5">{children}</div>
      </div>
    </div>
  );
};
