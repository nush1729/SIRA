import type { ReactNode } from "react";
export interface EmptyStateProps { title: string; description: string; action?: ReactNode; tone?: "neutral" | "warning" | "error" }
export function EmptyState({ title, description, action, tone = "neutral" }: EmptyStateProps) {
  const color = tone === "warning" ? "border-amber-200 bg-amber-50" : tone === "error" ? "border-rose-200 bg-rose-50" : "border-zinc-200 bg-zinc-50";
  return <section className={`space-y-3 rounded-lg border p-5 ${color}`} role={tone === "error" ? "alert" : undefined}><h2 className="font-semibold text-zinc-900">{title}</h2><p className="text-sm leading-6 text-zinc-600">{description}</p>{action}</section>;
}
