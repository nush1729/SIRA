import type { HTMLAttributes } from "react";
export function Card({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rounded-lg border border-zinc-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}
