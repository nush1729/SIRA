"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CandidateShell } from "@/components/shells/CandidateShell";
import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { getPublicRequest } from "@/lib/api-public";
import type { PublicRequestDTO } from "@/lib/contracts";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export default function CandidateIntroPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<PublicRequestDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <CandidateShell>
        <LoadingState label="Loading interview details…" />
      </CandidateShell>
    );
  }

  if (error || !request) {
    return (
      <CandidateShell cardClassName="max-w-md sm:max-w-xl">
        <EmptyState
          tone="warning"
          title="This link has expired"
          description={error || "This scheduling link is no longer valid. Please contact your recruiter to receive an updated invitation."}
          action={
            <Link href="/" className={buttonStyles("secondary", "mt-4")}>
              Return to home
            </Link>
          }
        />
      </CandidateShell>
    );
  }

  const firstName = getFirstName(request.candidateName);
  const recruiterInitials = getInitials(request.recruiterName);

  return (
    <CandidateShell>
      <div className="lg:grid lg:grid-cols-12 lg:gap-12 lg:items-start">
        {/* Left Column: Greeting, Context, CTA */}
        <div className="space-y-6 lg:col-span-7">
          {/* Recruiter Avatar & Intro Header */}
          <div className="flex items-center gap-3.5">
            <div
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700 ring-2 ring-white shadow-xs"
            >
              {recruiterInitials}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                {request.recruiterName}
              </p>
              <p className="text-xs text-zinc-500">Talent Acquisition</p>
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-3">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl lg:text-4xl">
              Hi {firstName}, let&apos;s find a time
            </h1>
            <p className="text-sm leading-relaxed text-zinc-600 sm:text-base">
              You&apos;ve been invited to schedule your upcoming conversation. In two quick steps, we&apos;ll match your availability with the interviewer team and give you instant confirmation.
            </p>
          </div>

          {/* Primary Action Button */}
          <div className="pt-2">
            <Link
              href={`/s/${encodeURIComponent(token)}/days`}
              className={buttonStyles("primary", "w-full text-base py-3 sm:w-auto sm:px-8")}
            >
              Get started →
            </Link>
            <p className="mt-3 text-xs text-zinc-500">
              No account required · Private, secure invitation link
            </p>
          </div>
        </div>

        {/* Right Column: Interview Details Card & Overview */}
        <div className="mt-8 space-y-4 lg:mt-0 lg:col-span-5">
          {/* Interview Details Card */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-5 text-sm space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Role
                </span>
                <p className="font-semibold text-zinc-900 text-base">{request.jobTitle}</p>
              </div>
              <StatusPill status={request.status} />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-zinc-200/80 text-xs">
              <div>
                <span className="text-zinc-500">Round</span>
                <p className="font-medium capitalize text-zinc-900 text-sm">
                  {request.roundType.toLowerCase()}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Duration</span>
                <p className="font-medium text-zinc-900 text-sm">{request.durationMin} minutes</p>
              </div>
            </div>
          </div>

          {/* How scheduling works overview card */}
          <div className="rounded-xl border border-zinc-100 bg-white p-4 text-xs text-zinc-600 space-y-2.5">
            <p className="font-semibold text-zinc-900 uppercase tracking-wider text-[11px]">
              How it works
            </p>
            <ol className="space-y-2">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-semibold text-indigo-700 text-[11px]">
                  1
                </span>
                <span>Select the days you are available in your local timezone.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-semibold text-indigo-700 text-[11px]">
                  2
                </span>
                <span>Choose from conflict-free, ranked slots recommended for you.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-semibold text-indigo-700 text-[11px]">
                  3
                </span>
                <span>Receive instant calendar invite with Google Meet coordinates.</span>
              </li>
            </ol>
          </div>

          {/* Existing booking notice if already confirmed */}
          {request.booking && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <p className="font-medium">You currently have a scheduled interview.</p>
              <div className="mt-2 flex gap-2">
                <Link
                  href={`/s/${encodeURIComponent(token)}/confirmed`}
                  className={buttonStyles("secondary", "text-xs py-1.5 min-h-9")}
                >
                  View confirmation
                </Link>
                <Link
                  href={`/s/${encodeURIComponent(token)}/reschedule`}
                  className={buttonStyles("ghost", "text-xs py-1.5 min-h-9")}
                >
                  Reschedule
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </CandidateShell>
  );
}
