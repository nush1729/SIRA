"use client";
import { Button } from "./Button";
export interface ToastProps { message: string | null; onDismiss: () => void; tone?: "info" | "success" | "error" }
/** Remains visible until dismissed, so recovery advice is not lost. */
export function Toast({ message, onDismiss, tone = "info" }: ToastProps) {
  if (!message) return null;
  const color = tone === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-indigo-200 bg-indigo-50 text-indigo-900";
  return <div className={`enter flex items-start gap-2 rounded-lg border p-3 ${color}`} role={tone === "error" ? "alert" : "status"}><p className="flex-1 self-center text-sm leading-6">{message}</p><Button className="shrink-0 px-2" variant="ghost" aria-label="Dismiss message" onClick={onDismiss}>×</Button></div>;
}
