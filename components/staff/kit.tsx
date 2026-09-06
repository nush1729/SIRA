"use client";

/**
 * ============================================================================
 *  Staff adapter over Role D's design system.
 *
 *  Every visual in here is one of D's `components/ui/*` primitives — this file
 *  only adapts prop shapes (D's `Input` takes `label`, mine wrapped it in a
 *  `Field`; D's `Toast` is a single node, staff pages stack them) and adds two
 *  compositions that are layout, not new primitives: `Card` with a header, and
 *  `ErrorState`.
 *
 *  Nothing here invents a second visual language. If a staff screen needs a
 *  genuinely new primitive, it belongs in `components/ui/` — tell D.
 * ============================================================================
 */

import * as React from "react";
import {
  Button as UiButton,
  Card as UiCard,
  Chip as UiChip,
  Dialog as UiDialog,
  EmptyState as UiEmptyState,
  Input as UiInput,
  Select as UiSelect,
  Skeleton,
  StatusPill,
  Toast as UiToast,
} from "@/components/ui";

export { Skeleton, StatusPill };

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* --- Button: adds the compact size staff tables need ---------------------- */
type UiButtonProps = React.ComponentProps<typeof UiButton>;
export function Button({
  size = "md",
  className = "",
  ...rest
}: UiButtonProps & { size?: "sm" | "md" }) {
  return (
    <UiButton
      {...rest}
      className={cx(size === "sm" && "min-h-9 px-3 py-1.5 text-[13px]", className)}
    />
  );
}

export function Chip(props: React.ComponentProps<typeof UiChip>) {
  return <UiChip {...props} />;
}

/* --- Card: D's surface, plus the header staff sections need ---------------- */
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
  const hasHeader = Boolean(title || actions);
  return (
    <UiCard id={id} className={cx("scroll-mt-24 p-0", className)}>
      {hasHeader && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={bodyClassName ?? "p-5"}>{children}</div>
    </UiCard>
  );
}

/* --- Inputs ---------------------------------------------------------------
 * D's Input/Select render their own label. Staff forms often sit inside a
 * `Field` that already provides one, and toolbar controls label themselves
 * with aria-label — so make `label` optional here and hide it visually when
 * the surrounding markup is already doing the labelling.
 * ------------------------------------------------------------------------ */
type UiInputProps = React.ComponentProps<typeof UiInput>;
export function Input({ label, ...rest }: Omit<UiInputProps, "label"> & { label?: string }) {
  const aria = rest["aria-label"];
  return <UiInput {...rest} label={label ?? aria ?? ""} hideLabel={!label} />;
}

type UiSelectProps = React.ComponentProps<typeof UiSelect>;
export function Select({ label, ...rest }: Omit<UiSelectProps, "label"> & { label?: string }) {
  const aria = rest["aria-label"];
  return <UiSelect {...rest} label={label ?? aria ?? ""} hideLabel={!label} />;
}

/**
 * For groups that aren't a single input (chip rows, date pairs) — gives them
 * the same label/hint/error treatment D's Input uses.
 */
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
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-800">
        {label}
      </label>
      {children}
      {(hint || error) && (
        <p role={error ? "alert" : undefined} className={cx("text-sm", error ? "text-rose-700" : "text-zinc-500")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/* --- Dialog: D's dialog + the footer row staff confirmations use ----------- */
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
  return (
    <UiDialog
      open={open}
      onClose={onClose}
      title={title}
      description={typeof description === "string" ? description : undefined}
    >
      {typeof description !== "string" && description ? (
        <div className="mb-4 text-sm text-zinc-600">{description}</div>
      ) : null}
      {children}
      {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
    </UiDialog>
  );
}

/* --- EmptyState / ErrorState ---------------------------------------------- */
export function EmptyState({
  title,
  body,
  action,
  icon,
  tone = "neutral",
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "warning" | "error";
}) {
  return (
    <UiEmptyState
      tone={tone}
      title={icon ? `${icon}  ${title}` : title}
      description={body ?? ""}
      action={action}
    />
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <UiEmptyState
      tone="error"
      title="Something went wrong"
      description={message}
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}

/* --- Toast ---------------------------------------------------------------- */
export type ToastTone = "info" | "success" | "warn" | "danger";

/** Staff pages use warn/danger; D's toast speaks info/success/error. */
export function Toast({
  message,
  tone = "info",
  onDismiss,
}: {
  message: string;
  tone?: ToastTone;
  onDismiss?: () => void;
}) {
  const uiTone = tone === "danger" ? "error" : tone === "warn" ? "info" : tone;
  return (
    <div className={cx("w-full max-w-sm", tone === "warn" && "[&>div]:border-amber-200 [&>div]:bg-amber-50 [&>div]:text-amber-900")}>
      <UiToast message={message} tone={uiTone as "info" | "success" | "error"} onDismiss={onDismiss ?? (() => {})} />
    </div>
  );
}
