"use client";

/** Role C — one toast stack per page, driven by the `useToasts` hook. */

import * as React from "react";
import { Toast, type ToastTone } from "@/components/staff/kit";

export type ToastItem = { id: number; message: string; tone: ToastTone };

export function useToasts() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const seq = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = React.useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = ++seq.current;
      setToasts((t) => [...t, { id, message, tone }]);
      setTimeout(() => dismiss(id), 6000);
    },
    [dismiss]
  );

  return { toasts, push, dismiss };
}

export function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end">
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} tone={t.tone} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}
