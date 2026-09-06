"use client";
import { useId, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> { label: string; hint?: string; error?: string }
export function Input({ label, hint, error, id, className = "", ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return <div className="space-y-1.5">
    <label htmlFor={inputId} className="block text-sm font-medium text-zinc-800">{label}</label>
    <input {...props} id={inputId} aria-invalid={!!error} aria-describedby={[props["aria-describedby"], (hint || error) ? `${inputId}-description` : null].filter(Boolean).join(" ") || undefined} className={`min-h-11 w-full min-w-0 rounded-md border bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-500 disabled:bg-zinc-100 disabled:text-zinc-500 ${error ? "border-rose-600" : "border-zinc-200"} ${className}`} />
    {(hint || error) && <p id={`${inputId}-description`} role={error ? "alert" : undefined} className={`text-sm ${error ? "text-rose-700" : "text-zinc-500"}`}>{error ?? hint}</p>}
  </div>;
}
