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

const ACCENT_BADGE: Record<NonNullable<AuraModalProps['accentColor']>, string> = {
  emerald: 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]',
  sky: 'bg-[#EFF6FF] text-[#1E3A8A] border-[#BFDBFE]',
  violet: 'bg-[#EFF6FF] text-[#1E3A8A] border-[#BFDBFE]',
  amber: 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]'
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
      className="fixed inset-0 z-[70] bg-[#111827]/45 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-[#FFFFFF] rounded-lg w-full ${maxWidthClass} max-h-[88dvh] flex flex-col border border-[#E5E7EB] my-auto overflow-hidden`}
      >
        <div className="px-4 pt-3.5 pb-3 border-b border-[#E5E7EB] bg-[#F9FAFB] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 space-y-1">
            {badge && (
              <span
                className={`inline-block px-2 py-0.5 rounded font-mono text-[10px] font-semibold uppercase tracking-wider border ${ACCENT_BADGE[accentColor]}`}
              >
                {badge}
              </span>
            )}
            <h3 className="font-bold text-base text-[#111827] leading-snug">{title}</h3>
            {subtitle && <p className="text-xs text-[#6B7280] leading-relaxed">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#9CA3AF] text-[#6B7280] hover:text-[#111827] flex items-center justify-center shrink-0 transition-colors duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3.5 text-[#111827]">{children}</div>
      </div>
    </div>
  );
};
