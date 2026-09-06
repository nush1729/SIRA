"use client";
import { useId, type SelectHTMLAttributes } from "react";

/** hideLabel keeps the label for screen readers but not on screen —
 *  for toolbar controls whose purpose is obvious from context. */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { label: string; hint?: string; error?: string; hideLabel?: boolean }
export function Select({ label, hint, error, hideLabel = false, id, className = "", children, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return <div className="space-y-1.5">
    <label htmlFor={selectId} className={hideLabel ? "sr-only" : "block text-sm font-medium text-zinc-800"}>{label}</label>
    <select {...props} id={selectId} aria-invalid={!!error} aria-describedby={[props["aria-describedby"], (hint || error) ? `${selectId}-description` : null].filter(Boolean).join(" ") || undefined} className={`min-h-11 w-full min-w-0 rounded-md border bg-white px-3 py-2 text-base text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500 ${error ? "border-rose-600" : "border-zinc-200"} ${className}`}>{children}</select>
    {(hint || error) && <p id={`${selectId}-description`} role={error ? "alert" : undefined} className={`text-sm ${error ? "text-rose-700" : "text-zinc-500"}`}>{error ?? hint}</p>}
  </div>;
}
