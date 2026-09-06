/**
 * PLACEHOLDER (Role D / design system) — the SIRA brand mark.
 * Role C imports this on every staff page; keep the API (`size`, `showWordmark`,
 * `tagline`) if you restyle it.
 */
import * as React from "react";

export function SiraMark({ size = 32 }: { size?: number }) {
  const id = React.useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="SIRA"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="40" rx="11" fill={`url(#${id}-g)`} />
      {/* calendar body */}
      <rect x="9" y="11" width="22" height="20" rx="4.5" fill="none" stroke="white" strokeWidth="2" opacity=".95" />
      <path d="M9 17h22" stroke="white" strokeWidth="2" opacity=".95" />
      <path d="M15 8v5M25 8v5" stroke="white" strokeWidth="2" strokeLinecap="round" opacity=".95" />
      {/* the "resolved slot" tick */}
      <path
        d="M14.5 24.2l3.4 3.4 7.4-7.4"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SiraLogo({
  size = 32,
  showWordmark = true,
  tagline,
  className = "",
}: {
  size?: number;
  showWordmark?: boolean;
  tagline?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SiraMark size={size} />
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className="font-semibold tracking-[0.18em] text-zinc-900"
            style={{ fontSize: Math.max(13, size * 0.46) }}
          >
            SIRA
          </span>
          {tagline && (
            <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
