import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 border-transparent",
  secondary: "bg-white text-zinc-900 border-zinc-200 hover:bg-zinc-50",
  ghost: "bg-transparent text-zinc-700 border-transparent hover:bg-zinc-100",
  danger: "bg-rose-600 text-white border-transparent hover:bg-rose-700",
};

/** Also usable on next/link without nesting interactive elements. */
export function buttonStyles(variant: ButtonVariant = "primary", className = "") {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold text-center transition duration-120 active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 ${variants[variant]} ${className}`;
}
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
}
export function Button({ variant = "primary", loading = false, loadingText = "Please wait…", disabled, className, children, type = "button", ...props }: ButtonProps) {
  return <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonStyles(variant, className)}>{loading ? loadingText : children}</button>;
}
