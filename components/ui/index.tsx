"use client";

/**
 * ============================================================================
 *  PLACEHOLDER DESIGN SYSTEM — milestone D0, owned by Role D.
 *
 *  Role C must NOT grow its own primitives (docs/09). Until D pushes the real
 *  `components/ui/*`, these stand in: same names, same props, tokens from
 *  docs/03 section 1. At integration, delete this file and re-point imports.
 * ============================================================================
 */

import * as React from "react";
import type { PanelStatus, ReqStatus } from "@/lib/contracts";

/* --- cx ------------------------------------------------------------------ */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* --- Button -------------------------------------------------------------- */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

const BTN_VARIANT: Record<string, string> = {
  primary:
    "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/30 " +
    "disabled:bg-indigo-300 disabled:shadow-none",
  secondary:
    "bg-white text-zinc-700 ring-1 ring-inset ring-zinc-200 shadow-sm hover:bg-zinc-50 hover:text-zinc-900 " +
    "hover:ring-zinc-300 disabled:text-zinc-400 disabled:bg-zinc-50 disabled:shadow-none",
  ghost:
    "bg-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:text-zinc-300",
  danger:
    "bg-white text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 hover:ring-rose-300 " +
    "disabled:text-rose-300 disabled:ring-rose-100",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 rounded-md font-medium",
        "transition duration-120 active:scale-[.97] disabled:cursor-not-allowed disabled:active:scale-100",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        BTN_VARIANT[variant],
        className
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={cx("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* --- Input / Select / Field ---------------------------------------------- */
const FIELD =
  "w-full rounded-md bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm " +
  "ring-1 ring-inset ring-zinc-200 transition hover:ring-zinc-300 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500 " +
  "disabled:bg-zinc-50 disabled:text-zinc-400 disabled:ring-zinc-200";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} {...rest} className={cx(FIELD, "h-10", className)} />;
  }
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} {...rest} className={cx(FIELD, "h-10 pr-8", className)}>
        {children}
      </select>
    );
  }
);

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-700">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

/* --- Chip ---------------------------------------------------------------- */
export function Chip({
  selected = false,
  disabled = false,
  onClick,
  children,
}: {
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        "select-none rounded-full px-3.5 py-1.5 text-[13px] font-medium ring-1 ring-inset transition",
        "duration-120 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        selected
          ? "bg-indigo-600 text-white ring-indigo-600 shadow-sm shadow-indigo-600/20"
          : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 hover:ring-zinc-300"
      )}
    >
      {children}
    </button>
  );
}

/* --- StatusPill ---------------------------------------------------------- */
type PillMeta = { label: string; cls: string; dot?: boolean };

const REQ_STATUS: Record<ReqStatus, PillMeta> = {
  DRAFT: { label: "DRAFT", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  AWAITING_AVAILABILITY: { label: "AWAITING AVAILABILITY", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  READY_TO_SCHEDULE: { label: "READY TO SCHEDULE", cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  SCHEDULED: { label: "SCHEDULED", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  RESCHEDULE_REQUIRED: { label: "RESCHEDULE REQUIRED", cls: "bg-amber-100 text-amber-900 ring-amber-300", dot: true },
  CANCELLED: { label: "CANCELLED", cls: "bg-zinc-100 text-zinc-500 ring-zinc-200" },
};

const PANEL_STATUS: Record<PanelStatus, PillMeta> = {
  PENDING: { label: "PENDING", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  ACCEPTED: { label: "ACCEPTED", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  DECLINED: { label: "DECLINED", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  REPLACED: { label: "REPLACED", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
};

export function StatusPill({ status }: { status: ReqStatus | PanelStatus }) {
  const pool: Record<string, PillMeta> = { ...REQ_STATUS, ...PANEL_STATUS };
  const meta: PillMeta = pool[status] ?? {
    label: String(status),
    cls: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ring-1 ring-inset",
        meta.cls
      )}
    >
      {meta.dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {meta.label}
    </span>
  );
}

/* --- Card ---------------------------------------------------------------- */
export function Card({
  id,
  title,
  subtitle,
  actions,
  className,
  bodyClassName,
  children,
}: {
  id?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cx("scroll-mt-24 rounded-xl bg-white shadow-sm ring-1 ring-zinc-200/80", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={cx("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/* --- Dialog -------------------------------------------------------------- */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-zinc-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md animate-scale-in rounded-t-2xl bg-white p-5 shadow-xl ring-1 ring-zinc-200 sm:rounded-xl"
      >
        <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
        {description && <div className="mt-1.5 text-sm text-zinc-600">{description}</div>}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* --- Toast --------------------------------------------------------------- */
export type ToastTone = "info" | "success" | "warn" | "danger";

const TOAST_TONE: Record<ToastTone, { cls: string; icon: string }> = {
  info: { cls: "ring-zinc-200 bg-white text-zinc-800", icon: "ℹ" },
  success: { cls: "ring-emerald-200 bg-emerald-50 text-emerald-800", icon: "✓" },
  warn: { cls: "ring-amber-200 bg-amber-50 text-amber-900", icon: "⚠" },
  danger: { cls: "ring-rose-200 bg-rose-50 text-rose-800", icon: "✕" },
};

export function Toast({
  message,
  tone = "info",
  onDismiss,
}: {
  message: string;
  tone?: ToastTone;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      className={cx(
        "pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-2.5 rounded-lg px-4 py-3",
        "text-sm shadow-lg shadow-zinc-900/5 ring-1",
        TOAST_TONE[tone].cls
      )}
    >
      <span className="mt-px font-semibold" aria-hidden>
        {TOAST_TONE[tone].icon}
      </span>
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
          &times;
        </button>
      )}
    </div>
  );
}

/* --- Skeleton ------------------------------------------------------------ */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-zinc-200/70", className)} />;
}

/* --- EmptyState ---------------------------------------------------------- */
export function EmptyState({
  title,
  body,
  action,
  icon = "\u{1F4ED}",
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 px-6 py-14 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-white text-xl shadow-sm ring-1 ring-zinc-200" aria-hidden>
        {icon}
      </div>
      <p className="text-sm font-semibold text-zinc-800">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-zinc-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* --- ErrorState ---------------------------------------------------------- */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-rose-50 px-6 py-12 text-center ring-1 ring-rose-200">
      <div className="mb-2 text-2xl" aria-hidden>
        {"⚠️"}
      </div>
      <p className="text-sm font-semibold text-rose-800">Something went wrong</p>
      <p className="mt-1 max-w-sm text-sm text-rose-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
