"use client";

/**
 * Role C — /dashboard, the pipeline (docs/09 §3).
 * Counters · search · status filter · request rows. Counters are computed from
 * the unfiltered list so they stay honest while you filter.
 */

import * as React from "react";
import Link from "next/link";
import { Button, Card, EmptyState, ErrorState, Input, Select, Skeleton } from "@/components/staff/kit";
import { CounterTiles } from "@/components/staff/CounterTiles";
import { RequestRow } from "@/components/staff/RequestRow";
import { useAsync, useDebounced } from "@/components/staff/useAsync";
import { useStaffSession } from "@/components/staff/session";
import { AdminOnly } from "@/components/staff/AdminOnly";
import { zoneCity } from "@/components/staff/format";
import { getRequests } from "@/lib/api-client";
import type { ReqStatus, RequestListItemDTO } from "@/lib/contracts";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "AWAITING_AVAILABILITY", label: "Awaiting availability" },
  { value: "READY_TO_SCHEDULE", label: "Ready to schedule" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "RESCHEDULE_REQUIRED", label: "Reschedule required" },
  { value: "DRAFT", label: "Draft" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function DashboardPage() {
  // The pipeline is the scheduling surface, so it is admin-only (see AdminOnly).
  return (
    <AdminOnly>
      <Pipeline />
    </AdminOnly>
  );
}

function Pipeline() {
  const me = useStaffSession();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<string>("ALL");
  const debouncedQ = useDebounced(q, 250);
  const SEARCH_ID = "staff-pipeline-search";

  // "/" jumps to search — the one shortcut a pipeline screen earns.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      const search = document.getElementById(SEARCH_ID) as HTMLInputElement | null;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        search?.focus();
      }
      if (e.key === "Escape" && el === search) {
        setQ("");
        search?.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // One unfiltered fetch drives both the counters and (filtered client-side)
  // the list, so the two can never disagree on screen.
  const { data, loading, error, reload } = useAsync<RequestListItemDTO[]>(() => getRequests(), []);
  const rows = data ?? [];

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => {
      c[r.status] = (c[r.status] ?? 0) + 1;
    });
    return c;
  }, [rows]);

  const visible = React.useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (!needle) return true;
      return (
        r.candidate.name.toLowerCase().includes(needle) ||
        r.candidate.email.toLowerCase().includes(needle) ||
        r.jobTitle.toLowerCase().includes(needle)
      );
    });
  }, [rows, status, debouncedQ]);

  const filtering = status !== "ALL" || debouncedQ.trim().length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600">Pipeline</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Interviews</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {loading
              ? "Loading your pipeline…"
              : `${rows.length} request${rows.length === 1 ? "" : "s"} · all times shown in ${zoneCity(me.timezone)}`}
          </p>
        </div>
        <Link href="/requests/new">
          <Button variant="primary">
            <span aria-hidden>+</span> New interview
          </Button>
        </Link>
      </header>

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          <CounterTiles counts={counts} activeStatus={status} onSelect={(s) => setStatus(s)} />

          <Card
            bodyClassName="p-0"
            title="Pipeline"
            subtitle={filtering ? `${visible.length} of ${rows.length} shown` : undefined}
            actions={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <div className="relative sm:w-72">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden>
                    ⌕
                  </span>
                  <Input
                    id={SEARCH_ID}
                    type="search"
                    placeholder="Search candidate, email or job…"
                    aria-label="Search interviews"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="pl-8 pr-10"
                  />
                  {!q && (
                    <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 sm:block">
                      /
                    </kbd>
                  )}
                </div>
                <Select
                  aria-label="Filter by status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="sm:w-52"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            }
          >
            {rows.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No interviews yet"
                  body="Create your first request and SIRA will pick a panel and find the times that work."
                  action={
                    <Link href="/requests/new">
                      <Button variant="primary">Create your first request</Button>
                    </Link>
                  }
                />
              </div>
            ) : visible.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon="🔍"
                  title="Nothing matches those filters"
                  body="Try a different search term, or clear the status filter."
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setQ("");
                        setStatus("ALL");
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {visible.map((row) => (
                  <RequestRow key={row.id} row={row} viewerTz={me.timezone} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
