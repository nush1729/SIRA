"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DateTime } from "luxon";
import { CandidateShell } from "@/components/shells/CandidateShell";
import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/Skeleton";
import { formatSlotTime } from "@/components/ui/format-time";
import { getPublicRequest } from "@/lib/api-public";
import type { PublicRequestDTO } from "@/lib/contracts";

function generateIcsContent(
  title: string,
  description: string,
  location: string,
  startUtc: string,
  endUtc: string
): string {
  const formatUtcForIcs = (iso: string) => {
    return DateTime.fromISO(iso, { zone: "utc" }).toFormat("yyyyLLdd'T'HHmmss'Z'");
  };

  const dtStart = formatUtcForIcs(startUtc);
  const dtEnd = formatUtcForIcs(endUtc);
  const dtStamp = DateTime.utc().toFormat("yyyyLLdd'T'HHmmss'Z'");
  const uid = `sira-${Date.now()}@sira.local`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SIRA//Smart Interview Scheduling//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function ConfirmedContent() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const token = params?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<PublicRequestDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryTz = searchParams.get("tz");
  const [timezone, setTimezone] = useState(queryTz || "America/New_York");

  useEffect(() => {
    if (!token) return;
    let active = true;

    async function load() {
      const res = await getPublicRequest(token);
      if (!active) return;

      if (res.ok) {
        setRequest(res.data);
        if (!queryTz && res.data.candidateTimezone) {
          setTimezone(res.data.candidateTimezone);
        }
      } else {
        setError(res.error.message || "This link has expired.");
      }
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [token, queryTz]);

  if (loading) {
    return (
      <CandidateShell step={3} cardClassName="max-w-md sm:max-w-2xl lg:max-w-4xl">
        <LoadingState label="Loading confirmation details…" />
      </CandidateShell>
    );
  }

  if (error || !request) {
    return (
      <CandidateShell cardClassName="max-w-md sm:max-w-xl">
        <EmptyState
          tone="warning"
          title="Unable to find booking"
          description={error || "Could not load booking details for this interview link."}
          action={
            <Link href="/" className={buttonStyles("secondary", "mt-4")}>
              Return to home
            </Link>
          }
        />
      </CandidateShell>
    );
  }

  const booking = request.booking;
  if (!booking) {
    return (
      <CandidateShell step={2} cardClassName="max-w-md sm:max-w-xl">
        <EmptyState
          tone="neutral"
          title="No confirmed booking yet"
          description="You haven't confirmed an interview time yet. Please select from available times."
          action={
            <Link
              href={`/s/${encodeURIComponent(token)}/times`}
              className={buttonStyles("primary", "mt-4")}
            >
              Choose a time →
            </Link>
          }
        />
      </CandidateShell>
    );
  }

  const formatted = formatSlotTime(
    { start: booking.startUtc, end: booking.endUtc },
    timezone
  );

  const interviewersText =
    booking.interviewerNames && booking.interviewerNames.length > 0
      ? booking.interviewerNames.join(", ")
      : request.recruiterName;

  const icsDownloadUrl = `data:text/calendar;charset=utf8,${encodeURIComponent(
    generateIcsContent(
      `${request.jobTitle} Interview · ${request.roundType}`,
      `Interview with ${interviewersText} for ${request.jobTitle}. Join link: ${booking.meetLink || "TBD"}`,
      booking.meetLink || "Online meeting",
      booking.startUtc,
      booking.endUtc
    )
  )}`;

  return (
    <CandidateShell step={3} cardClassName="max-w-md sm:max-w-2xl lg:max-w-4xl">
      <div className="space-y-8">
        {/* Emerald Header Card with animated Checkmark */}
        <div className="flex flex-col items-center rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 sm:p-8 text-center">
          <div
            aria-hidden="true"
            className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs"
          >
            <svg
              className="h-8 w-8 sm:h-10 sm:w-10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path className="checkmark-path" d="M4 12l5 5L20 6" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-emerald-950 sm:text-3xl">
            You&apos;re all set!
          </h1>
          <p className="mt-1.5 text-sm text-emerald-800 max-w-md">
            Your interview has been booked. A calendar invite with meeting details has been dispatched.
          </p>
        </div>

        {/* Responsive Desktop Two-Column Composition */}
        <div className="lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
          {/* Left Column: Scheduled Time & Role Details */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-xs space-y-5 text-left lg:col-span-7">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Confirmed Time
              </span>
              <p className="mt-1 text-xl font-bold text-zinc-950 sm:text-2xl">
                {formatted?.date}
              </p>
              <p className="text-base sm:text-lg font-semibold text-indigo-700">
                {formatted?.time}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {timezone.replaceAll("_", " ")}
              </p>
            </div>

            <div className="border-t border-zinc-100 pt-4 space-y-2.5 text-sm text-zinc-700">
              <div className="flex justify-between">
                <span className="text-zinc-500">Role</span>
                <span className="font-semibold text-zinc-900">{request.jobTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Round</span>
                <span className="font-medium capitalize text-zinc-900">
                  {request.roundType.toLowerCase()} ({request.durationMin}m)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Panel</span>
                <span className="font-medium text-zinc-900">{interviewersText}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Actions & Reschedule Link */}
          <div className="mt-6 space-y-4 lg:mt-0 lg:col-span-5">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-5 space-y-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Next Steps
              </p>

              {booking.meetLink ? (
                <a
                  href={booking.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonStyles("primary", "w-full py-3 text-base font-semibold")}
                >
                  Join video meeting →
                </a>
              ) : (
                <p className="text-center text-xs text-zinc-500 py-2">
                  Video link will be provided before the session.
                </p>
              )}

              <a
                href={icsDownloadUrl}
                download="interview-invite.ics"
                className={buttonStyles("secondary", "w-full py-2.5 text-sm")}
              >
                Add to calendar (.ics)
              </a>
            </div>

            {/* Quiet Reschedule Link */}
            <div className="pt-2 text-center">
              <Link
                href={`/s/${encodeURIComponent(token)}/reschedule`}
                className="text-xs text-zinc-500 hover:text-indigo-700 transition"
              >
                Plans changed? <span className="underline">I need to reschedule</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </CandidateShell>
  );
}

export default function CandidateConfirmedPage() {
  return (
    <Suspense
      fallback={
        <CandidateShell step={3}>
          <LoadingState label="Loading confirmation…" />
        </CandidateShell>
      }
    >
      <ConfirmedContent />
    </Suspense>
  );
}
