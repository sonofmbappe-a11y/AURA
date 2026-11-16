import React from 'react';

interface AuraLogoProps {
  className?: string;
  size?: number;
}

export const AuraLogo: React.FC<AuraLogoProps> = ({ className = '', size = 38 }) => {
  return (
    <div
      role="img"
      aria-label="AURA"
      style={{ width: size, height: size }}
      className={`relative shrink-0 overflow-hidden rounded-xl bg-[#0B1020] border border-[#232C3D] shadow-xs flex items-center justify-center ${className}`}
    >
      <img
        src="/app_icon.png"
        alt=""
        width={size}
        height={size}
        decoding="async"
        className="w-full h-full object-cover select-none"
      />
    </div>
  );
};
