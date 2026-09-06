import type { GeneratedSlot } from "@/lib/contracts";
import type { ReactNode } from "react";
import { formatSlotTime } from "./format-time";
export interface SlotCardProps {
  slot: GeneratedSlot;
  timezone: string;
  secondaryTimezone?: string;
  audience?: "candidate" | "staff";
  selected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  action?: ReactNode;
}
export function SlotCard({ slot, timezone, secondaryTimezone, audience = "candidate", selected = false, onSelect, disabled, action }: SlotCardProps) {
  const local = formatSlotTime(slot, timezone);
  const secondary = secondaryTimezone && secondaryTimezone !== timezone ? formatSlotTime(slot, secondaryTimezone) : null;
  if (!local) return <p role="alert" className="text-sm text-rose-700">This time is unavailable. Please refresh your options.</p>;
  const content = <>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-zinc-600">{local.date}</span>{slot.rank === 1 && <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">Recommended</span>}</div>
    <div className="text-base font-semibold text-zinc-900">{local.time}</div>
    <p className="mt-1 break-words text-sm text-zinc-500">{timezone.replaceAll("_", " ")}</p>
    {secondary && <p className="mt-2 break-words text-sm text-zinc-500">{secondary.date} · {secondary.time} · {secondaryTimezone!.replaceAll("_", " ")}</p>}
    {audience === "staff" && <div className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-600"><p>Rank {slot.rank} · Score {slot.score}</p><ul className="mt-2 space-y-1">{slot.reasons.map((reason, index) => <li key={index}>✓ {reason}</li>)}</ul></div>}
  </>;
  const style = `w-full min-w-0 rounded-lg border p-4 text-left shadow-sm transition-colors ${selected ? "border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600" : "border-zinc-200 bg-white"}`;
  return <div className="space-y-3">{onSelect ? <button type="button" aria-pressed={selected} disabled={disabled} onClick={onSelect} aria-label={`${local.date}, ${local.time}, ${timezone}${slot.rank === 1 ? ", Recommended" : ""}`} className={`${style} hover:border-indigo-400 disabled:opacity-45`}>{content}</button> : <div className={style}>{content}</div>}{action}</div>;
}
