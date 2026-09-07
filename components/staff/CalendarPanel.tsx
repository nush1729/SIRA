"use client";

/**
 * Role C — the interviewer's own calendar.
 *
 * Two sources, one toggle: the seeded demo calendar, or Google Calendar. The
 * source is passed straight to `getMyCalendar()` — no client-side merging, no
 * conflict logic here (that's the engine's job). This just draws what it gets.
 */

import * as React from "react";
import { Button, Card, EmptyState, ErrorState, Skeleton, cx } from "@/components/staff/kit";
import { fmtDay, fmtTime, zoneCity, zoneLabel } from "@/components/staff/format";
import { getMyCalendar } from "@/lib/api-client";
import { useAsync } from "@/components/staff/useAsync";
import type { CalendarDTO, CalendarEventDTO, CalendarSource } from "@/lib/contracts";

const SOURCES: { key: CalendarSource; label: string; hint: string }[] = [
  { key: "mock", label: "Demo calendar", hint: "The seeded schedule — always available, no account needed." },
  { key: "google", label: "Google Calendar", hint: "Your real calendar, read through the Google adapter." },
];

export function CalendarPanel({
  timezone,
  refreshKey = 0,
}: {
  timezone: string;
  /** Bump after an accept/decline so the week reflects it straight away. */
  refreshKey?: number;
}) {
  const [source, setSource] = React.useState<CalendarSource>("mock");
  const { data, loading, error, reload } = useAsync<CalendarDTO>(
    () => getMyCalendar(source),
    [source, refreshKey]
  );

  return (
    <Card
      title="My calendar"
      subtitle={`Everything SIRA schedules around, in ${zoneCity(timezone)}`}
      actions={<SourceToggle source={source} onChange={setSource} disabled={loading} />}
    >
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? null : !data.connected ? (
        <NotConnected source={data.source} onUseDemo={() => setSource("mock")} />
      ) : (
        <>
          <SourceBanner data={data} />
          <WeekList events={data.events} timezone={data.timezone} />
        </>
      )}
    </Card>
  );
}

function SourceToggle({
  source,
  onChange,
  disabled,
}: {
  source: CalendarSource;
  onChange: (s: CalendarSource) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Calendar source"
      className="inline-flex rounded-md bg-zinc-100 p-0.5"
    >
      {SOURCES.map((s) => (
        <button
          key={s.key}
          type="button"
          role="radio"
          aria-checked={source === s.key}
          title={s.hint}
          disabled={disabled}
          onClick={() => onChange(s.key)}
          className={cx(
            "rounded-[5px] px-3 py-1.5 text-[13px] font-medium transition disabled:cursor-not-allowed",
            source === s.key
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function SourceBanner({ data }: { data: CalendarDTO }) {
  const google = data.source === "google";
  // The backend only appends this suffix to accountLabel when PROVIDER_MODE
  // isn't actually "google" — i.e. the Google tab is showing simulated data
  // because real credentials aren't configured. Read that instead of a
  // hardcoded badge, or this claims "simulated" even when it's genuinely live.
  const simulated = google && Boolean(data.accountLabel?.includes("PROVIDER_MODE=mock"));
  return (
    <p
      className={cx(
        "mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-[12px] ring-1 ring-inset",
        google ? "bg-sky-50 text-sky-900 ring-sky-200" : "bg-zinc-50 text-zinc-600 ring-zinc-200"
      )}
    >
      <span aria-hidden>{google ? "🗓" : "🧪"}</span>
      <span className="font-medium">{google ? "Google Calendar" : "Demo calendar"}</span>
      <span className="opacity-70">·</span>
      <span className="truncate">{data.accountLabel}</span>
      {simulated && (
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 font-medium text-sky-700 ring-1 ring-sky-200">
          PROVIDER_MODE=mock — transport simulated
        </span>
      )}
    </p>
  );
}

function NotConnected({ source, onUseDemo }: { source: CalendarSource; onUseDemo: () => void }) {
  return (
    <EmptyState
      icon="🔌"
      title={source === "google" ? "Google Calendar isn't connected" : "No calendar available"}
      body="Connecting is a one-time OAuth consent handled by the server. Until then, the demo calendar shows the same schedule SIRA is scheduling around."
      action={
        <Button variant="secondary" onClick={onUseDemo}>
          Use the demo calendar
        </Button>
      }
    />
  );
}

/** Group events by local day and draw them as a compact agenda. */
function WeekList({ events, timezone }: { events: CalendarEventDTO[]; timezone: string }) {
  const days = React.useMemo(() => {
    const map = new Map<string, CalendarEventDTO[]>();
    events.forEach((e) => {
      const key = fmtDay(e.startUtc, timezone);
      map.set(key, [...(map.get(key) ?? []), e]);
    });
    return [...map.entries()];
  }, [events, timezone]);

  if (!days.length) {
    return <EmptyState icon="🌤" title="Nothing on your calendar" body="This week is completely open." />;
  }

  return (
    <div className="space-y-4">
      {days.map(([day, list]) => (
        <div key={day}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400">{day}</p>
          <ul className="space-y-1.5">
            {list.map((e) => {
              const interview = e.kind === "INTERVIEW";
              return (
                <li
                  key={e.id}
                  className={cx(
                    "flex items-center gap-3 overflow-hidden rounded-lg py-2 pl-3 pr-3 ring-1",
                    interview ? "bg-indigo-50/60 ring-indigo-200" : "bg-white ring-zinc-200/80"
                  )}
                >
                  <span
                    className={cx("h-8 w-1 shrink-0 rounded-full", interview ? "bg-indigo-500" : "bg-zinc-300")}
                    aria-hidden
                  />
                  <span className="w-32 shrink-0 text-[13px] font-medium tabular-nums text-zinc-700">
                    {fmtTime(e.startUtc, timezone)} – {fmtTime(e.endUtc, timezone)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-800">{e.title}</span>
                  {interview && (
                    <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Interview
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="border-t border-zinc-100 pt-3 text-xs text-zinc-500">
        Times shown in {zoneCity(timezone)} ({zoneLabel(events[0].startUtc, timezone)}). SIRA keeps a 15-minute
        buffer around every block above.
      </p>
    </div>
  );
}
