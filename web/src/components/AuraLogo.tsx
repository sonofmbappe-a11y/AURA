import React from 'react';

interface AuraLogoProps {
  className?: string;
  size?: number;
}

export const AuraLogo: React.FC<AuraLogoProps> = ({ className = '', size = 36 }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-label="AURA Academic Crest"
      className={className}
    >
      <rect width="64" height="64" rx="14" fill="#1D3B8B" />
      <rect
        x="4"
        y="4"
        width="56"
        height="56"
        rx="11"
        fill="none"
        stroke="#F6F4EF"
        strokeOpacity="0.18"
        strokeWidth="1.25"
      />
      <path
        d="M15.5 19.5C15.5 17.9 16.9 16.7 18.5 17L30.5 19.5V47L18 44.3C16.6 44 15.5 42.7 15.5 41.2V19.5Z"
        fill="#F6F4EF"
      />
      <path
        d="M48.5 19.5C48.5 17.9 47.1 16.7 45.5 17L33.5 19.5V47L46 44.3C47.4 44 48.5 42.7 48.5 41.2V19.5Z"
        fill="#DCE4F7"
      />
      <line
        x1="20"
        y1="26"
        x2="26.5"
        y2="27.4"
        stroke="#1D3B8B"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />
      <line
        x1="20"
        y1="32"
        x2="26.5"
        y2="33.4"
        stroke="#1D3B8B"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeOpacity="0.38"
      />
      <line
        x1="44"
        y1="26"
        x2="37.5"
        y2="27.4"
        stroke="#1D3B8B"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />
      <line
        x1="44"
        y1="32"
        x2="37.5"
        y2="33.4"
        stroke="#1D3B8B"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeOpacity="0.38"
      />
      <circle cx="49" cy="15" r="4" fill="#10B981" stroke="#1D3B8B" strokeWidth="1.5" />
    </svg>
  );
};
