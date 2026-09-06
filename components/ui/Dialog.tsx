"use client";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./Button";
export interface DialogProps { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }
/** Native modal dialog supplies focus containment, Escape and inert background. */
export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  function containFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <dialog ref={ref} onKeyDown={containFocus} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={() => { if (open) onClose(); }} aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined} className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border border-zinc-200 bg-white p-6 text-zinc-900 shadow-sm backdrop:bg-zinc-950/40">
    <div className="mb-4 flex items-start justify-between gap-4"><h2 id={`${id}-title`} className="pt-2 text-lg font-semibold">{title}</h2><Button variant="ghost" onClick={onClose} aria-label="Close dialog">×</Button></div>
    {description && <p id={`${id}-description`} className="mb-4 text-sm text-zinc-600">{description}</p>}{children}
  </dialog>;
}
