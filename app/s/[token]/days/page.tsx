"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DateTime } from "luxon";
import { CandidateShell } from "@/components/shells/CandidateShell";
import { Button, buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/Skeleton";
import { TimezoneSelect } from "@/components/ui/TimezoneSelect";
import { getFeasibleDays, getPublicRequest, submitAvailability } from "@/lib/api-public";
import type { PublicRequestDTO, TimeWindow } from "@/lib/contracts";

interface CalendarDay {
  date: DateTime;
  dateKey: string; // YYYY-MM-DD
  dayNumber: number;
  weekdayShort: string;
  isCurrentMonth: boolean;
  isSelectable: boolean;
  isWeekend: boolean;
  isPast: boolean;
}

export default function CandidateDaysPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<PublicRequestDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [timezone, setTimezone] = useState("America/New_York");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  /* Days the panel could actually cover. null = not known (mock mode, or the
   * check failed), in which case every weekday stays selectable. */
  const [feasible, setFeasible] = useState<Set<string> | null>(null);
  const [blockedReasons, setBlockedReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    getFeasibleDays(token).then((res) => {
      if (cancelled || !res.ok) return;
      if (!res.data.days.length && !res.data.blocked.length) return; // no model
      setFeasible(new Set(res.data.days));
      setBlockedReasons(Object.fromEntries(res.data.blocked.map((b) => [b.day, b.reason])));
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Load candidate request
  useEffect(() => {
    if (!token) return;

    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const res = await getPublicRequest(token);
      if (!active) return;

      if (res.ok) {
        setRequest(res.data);
        const tz = res.data.candidateTimezone || "America/New_York";
        setTimezone(tz);

        // Pre-select upcoming Monday and Tuesday as default suggestions
        const nowInZone = DateTime.now().setZone(tz);
        const daysUntilMon = (8 - nowInZone.weekday) % 7 || 7;
        const nextMon = nowInZone.plus({ days: daysUntilMon });
        const nextTue = nextMon.plus({ days: 1 });
        setSelectedDates(new Set([nextMon.toISODate()!, nextTue.toISODate()!]));
      } else {
        setError(res.error.message || "This link has expired — please contact your recruiter.");
      }
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [token]);

  // Calendar dates generation (shows 2 upcoming weeks anchored to next Monday)
  const calendarDays = useMemo(() => {
    const today = DateTime.now().setZone(timezone).startOf("day");
    const daysUntilMonday = (8 - today.weekday) % 7 || 7;
    const startMonday = today.plus({ days: daysUntilMonday });

    const days: CalendarDay[] = [];
    // Show 14 days starting from Monday (two full weeks Mon-Sun)
    for (let i = 0; i < 14; i++) {
      const current = startMonday.plus({ days: i });
      const isWeekend = current.weekday === 6 || current.weekday === 7;
      const isPast = current < today;
      // A day nobody on the panel can cover is not selectable, whatever the
      // calendar says.
      const panelCanCover = feasible === null || feasible.has(current.toISODate()!);
      const isSelectable = !isWeekend && !isPast && panelCanCover;

      days.push({
        date: current,
        dateKey: current.toISODate()!,
        dayNumber: current.day,
        weekdayShort: current.toFormat("ccc"),
        isCurrentMonth: true,
        isSelectable,
        isWeekend,
        isPast,
      });
    }
    return days;
  }, [timezone, feasible]);

  function toggleDate(dateKey: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }

  async function handleContinue() {
    if (selectedDates.size === 0 || !token) return;
    setIsSubmitting(true);

    // Build TimeWindow objects for chosen dates: 09:00 - 18:00 local time converted to UTC
    const windows: TimeWindow[] = Array.from(selectedDates).map((dateKey) => {
      const dayStartLocal = DateTime.fromISO(`${dateKey}T09:00:00`, { zone: timezone });
      const dayEndLocal = DateTime.fromISO(`${dateKey}T18:00:00`, { zone: timezone });
      return {
        start: dayStartLocal.toUTC().toISO()!,
        end: dayEndLocal.toUTC().toISO()!,
      };
    });

    // Save windows via public API
    await submitAvailability(token, windows);

    const sortedDates = Array.from(selectedDates).sort().join(",");
    router.push(
      `/s/${encodeURIComponent(token)}/times?days=${encodeURIComponent(sortedDates)}&tz=${encodeURIComponent(timezone)}`
    );
  }

  if (loading) {
    return (
      <CandidateShell step={1} backHref={`/s/${encodeURIComponent(token)}`}>
        <LoadingState label="Loading calendar…" />
      </CandidateShell>
    );
  }

  if (error || !request) {
    return (
      <CandidateShell cardClassName="max-w-md sm:max-w-xl">
        <EmptyState
          tone="warning"
          title="This link has expired"
          description={error || "This scheduling link is no longer valid. Please contact your recruiter."}
          action={
            <Link href="/" className={buttonStyles("secondary", "mt-4")}>
              Return to home
            </Link>
          }
        />
      </CandidateShell>
    );
  }

  const sortedSelectedArray = Array.from(selectedDates).sort();

  return (
    <CandidateShell
      step={1}
      backHref={`/s/${encodeURIComponent(token)}`}
      backLabel="Introduction"
    >
      <div className="lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start">
        {/* Left Column: Context, Timezone, Selection Summary, CTA */}
        <div className="space-y-6 lg:col-span-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              Step 1 of 2 · Availability
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">
              Pick a few days you are free
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Select the dates that work best for you. Next, you&apos;ll choose from ranked times matching both your schedule and the team&apos;s working hours.
            </p>
          </div>

          {/* Timezone Selector with live display */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-2">
            <TimezoneSelect value={timezone} onChange={setTimezone} />
            <p className="text-xs text-zinc-500">
              Working hours and times will be evaluated in{" "}
              <span className="font-semibold text-zinc-800">{timezone.replaceAll("_", " ")}</span>.
            </p>
          </div>

          {/* Selected Days Summary */}
          <div className="rounded-xl border border-zinc-100 bg-white p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Selected Dates
              </span>
              <span className="text-xs font-semibold text-indigo-700">
                {selectedDates.size} day{selectedDates.size === 1 ? "" : "s"} chosen
              </span>
            </div>

            {selectedDates.size > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {sortedSelectedArray.map((dateKey) => {
                  const dt = DateTime.fromISO(dateKey, { zone: timezone });
                  return (
                    <span
                      key={dateKey}
                      className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 border border-indigo-200"
                    >
                      <span>{dt.toFormat("ccc, d LLL")}</span>
                      <button
                        type="button"
                        onClick={() => toggleDate(dateKey)}
                        aria-label={`Remove ${dt.toFormat("cccc d LLLL")}`}
                        className="hover:text-indigo-900 ml-0.5 text-indigo-500"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 italic">No days selected yet.</p>
            )}
          </div>

          {/* Primary Action Button */}
          <div className="pt-2">
            <Button
              onClick={handleContinue}
              disabled={selectedDates.size === 0 || isSubmitting}
              loading={isSubmitting}
              loadingText="Saving availability…"
              className="w-full text-base py-3"
            >
              Continue to times ({selectedDates.size} selected) →
            </Button>
            {selectedDates.size === 0 && (
              <p className="mt-2 text-center text-xs text-amber-700">
                Please select at least one day to continue.
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Month Calendar */}
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs lg:mt-0 lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-base font-semibold text-zinc-950">
              {calendarDays[0]?.date.toFormat("LLLL yyyy")}
            </span>
            <span className="text-xs font-medium text-zinc-500">
              Showing 2-week scheduling window
            </span>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-zinc-500 pb-2 border-b border-zinc-100">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span className="text-zinc-400">Sat</span>
            <span className="text-zinc-400">Sun</span>
          </div>

          {/* Day Buttons */}
          <div className="grid grid-cols-7 gap-2 pt-3">
            {calendarDays.map((day) => {
              const isSelected = selectedDates.has(day.dateKey);

              if (!day.isSelectable) {
                return (
                  <div
                    key={day.dateKey}
                    aria-disabled="true"
                    title={
                      day.isWeekend
                        ? "Weekend (unavailable)"
                        : day.isPast
                          ? "Past date"
                          : (blockedReasons[day.dateKey] ?? "No interviewer can cover this day")
                    }
                    className="flex min-h-12 sm:min-h-14 flex-col items-center justify-center rounded-lg border border-transparent text-xs text-zinc-300 select-none bg-zinc-50/40"
                  >
                    <span>{day.dayNumber}</span>
                  </div>
                );
              }

              return (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() => toggleDate(day.dateKey)}
                  aria-pressed={isSelected}
                  aria-label={`${day.date.toFormat("cccc, d LLLL")}${isSelected ? ", selected" : ""}`}
                  className={`flex min-h-12 sm:min-h-14 flex-col items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-600 text-white shadow-xs"
                      : "border-zinc-200 bg-white text-zinc-800 hover:border-indigo-400 hover:bg-indigo-50/40"
                  }`}
                >
                  <span className="font-semibold">{day.dayNumber}</span>
                  <span
                    className={`text-[10px] hidden sm:block ${
                      isSelected ? "text-indigo-100" : "text-zinc-500"
                    }`}
                  >
                    {day.weekdayShort}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
            <span>● Blue = selected</span>
            <span>Weekends &amp; off-hours are disabled</span>
          </div>
        </div>
      </div>
    </CandidateShell>
  );
}
