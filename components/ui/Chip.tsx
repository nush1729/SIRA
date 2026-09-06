import type { ButtonHTMLAttributes } from "react";
export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> { selected?: boolean }
export function Chip({ selected = false, className = "", children, type = "button", ...props }: ChipProps) {
  return <button {...props} type={type} aria-pressed={selected} className={`min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-45 ${selected ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"} ${className}`}>{selected && <span aria-hidden="true">✓ </span>}{children}</button>;
}
