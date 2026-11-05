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
  emerald: 'border-emerald-400/45',
  sky: 'border-sky-400/45',
  violet: 'border-violet-400/45',
  amber: 'border-amber-400/50'
};

const ACCENT_BADGE: Record<NonNullable<AuraModalProps['accentColor']>, string> = {
  emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  sky: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
  violet: 'bg-violet-500/20 text-violet-300 border-violet-400/40',
  amber: 'bg-amber-500/20 text-amber-300 border-amber-400/40'
};

export const AuraModal: React.FC<AuraModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  badge,
  accentColor = 'emerald',
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
      className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`aura-glass rounded-3xl w-full ${maxWidthClass} max-h-[88dvh] flex flex-col border ${ACCENT_BORDER[accentColor]} shadow-2xl my-auto overflow-hidden`}
      >
        {/* Sticky Header with Always-Accessible Close X Button */}
        <div className="px-5 pt-4 pb-3 border-b border-white/10 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 space-y-1">
            {badge && (
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${ACCENT_BADGE[accentColor]}`}
              >
                {badge}
              </span>
            )}
            <h3 className="font-extrabold text-base sm:text-lg leading-snug">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 leading-relaxed">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-rose-500/25 hover:text-rose-300 flex items-center justify-center shrink-0 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-5 overflow-y-auto space-y-3.5">{children}</div>
      </div>
    </div>
  );
};
