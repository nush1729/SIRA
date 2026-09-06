"use client";

/**
 * Role C — the Notification rows (docs/09 §5). This is how the demo shows real
 * communication without opening an inbox. Table on desktop, stacked on mobile.
 */

import { EmptyState } from "@/components/ui";
import { fmtInstant, fmtRelative } from "@/components/staff/format";
import type { NotificationDTO } from "@/lib/contracts";

function StatusDot({ status }: { status: string }) {
  const ok = status.toUpperCase() === "SENT" || status.toUpperCase() === "DELIVERED";
  return (
    <span
      className={
        ok
          ? "inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700"
          : "inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700"
      }
    >
      <span className={ok ? "h-1.5 w-1.5 rounded-full bg-emerald-500" : "h-1.5 w-1.5 rounded-full bg-amber-500"} />
      {status}
    </span>
  );
}

export function EmailsTable({
  notifications,
  viewerTz,
}: {
  notifications: NotificationDTO[];
  viewerTz: string;
}) {
  if (notifications.length === 0) {
    return (
      <EmptyState
        icon="✉️"
        title="No emails sent yet"
        body="Everything SIRA sends about this interview will be listed here."
      />
    );
  }

  return (
    <>
      {/* mobile */}
      <ul className="space-y-3 sm:hidden">
        {notifications.map((n) => (
          <li key={n.id} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200/80">
            <p className="text-[13px] font-semibold text-zinc-900">{n.subject}</p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">to {n.toEmail}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-zinc-500" title={fmtInstant(n.createdAt, viewerTz)}>
                {fmtRelative(n.createdAt, viewerTz)}
              </span>
              <StatusDot status={n.status} />
            </div>
          </li>
        ))}
      </ul>

      {/* desktop */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-[11px] uppercase tracking-[0.08em] text-zinc-400">
              <th className="py-2 pr-4 font-semibold">Sent</th>
              <th className="py-2 pr-4 font-semibold">Recipient</th>
              <th className="py-2 pr-4 font-semibold">Subject</th>
              <th className="py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {notifications.map((n) => (
              <tr key={n.id} className="align-top transition hover:bg-zinc-50/70">
                <td className="whitespace-nowrap py-2.5 pr-4 text-[13px] text-zinc-500" title={fmtInstant(n.createdAt, viewerTz)}>
                  {fmtRelative(n.createdAt, viewerTz)}
                </td>
                <td className="py-2.5 pr-4 text-[13px] text-zinc-700">{n.toEmail}</td>
                <td className="py-2.5 pr-4 text-[13px] font-medium text-zinc-900">{n.subject}</td>
                <td className="py-2.5">
                  <StatusDot status={n.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
