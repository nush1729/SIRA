import type { BookStatus, PanelStatus, ReqStatus } from "@/lib/contracts";
export interface StatusPillProps { status: ReqStatus | PanelStatus | BookStatus; className?: string }
export function StatusPill({ status, className = "" }: StatusPillProps) {
  const color = ["CONFIRMED", "SCHEDULED", "ACCEPTED"].includes(status) ? "bg-emerald-50 text-emerald-700" : status === "DECLINED" ? "bg-rose-50 text-rose-700" : status === "READY_TO_SCHEDULE" ? "bg-indigo-50 text-indigo-700" : ["AWAITING_AVAILABILITY", "RESCHEDULE_REQUIRED", "PENDING"].includes(status) ? "bg-amber-50 text-amber-800" : "bg-zinc-100 text-zinc-600";
  return <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${color} ${className}`}><span aria-hidden="true">●</span>{status.replaceAll("_", " ")}</span>;
}
