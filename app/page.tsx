"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/Button";
import { SlotCard } from "@/components/ui/SlotCard";
import { TimezoneSelect } from "@/components/ui/TimezoneSelect";
import type { GeneratedSlot } from "@/lib/contracts";

const demoSlot: GeneratedSlot = {
  start: "2026-09-14T14:00:00Z",
  end: "2026-09-14T14:30:00Z",
  rank: 1,
  score: 95,
  interviewerIds: ["u_priya"],
  interviewerNames: ["Priya Sharma"],
  reasons: [
    "Fits candidate preferred window",
    "Interviewer available",
    "Within working hours in both timezones",
    "15-min buffer respected",
  ],
};

export default function HomePage() {
  const [timezone, setTimezone] = useState("America/New_York");
  const [selected, setSelected] = useState(true);

  return (
    <div className="candidate-background flex min-h-dvh w-full max-w-full flex-col justify-between overflow-x-hidden px-4 py-6 sm:px-8 sm:py-8 lg:px-12 xl:px-16">
      {/* Top Header Bar */}
      <header className="mx-auto flex w-full max-w-6xl xl:max-w-7xl items-center justify-between gap-2 py-3">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold tracking-tight text-zinc-950">
            sira<span className="text-indigo-600">.</span>
          </span>
        </div>

        {/* Center / Near-center: Category badge */}
        <div className="rounded-full bg-indigo-50/90 border border-indigo-100 px-3 py-1 text-[11px] sm:text-xs font-semibold tracking-wider uppercase text-indigo-700">
          Smart Scheduling
        </div>

        {/* Right: Balanced spacing, NO Sign In button */}
        <div className="w-8 sm:w-16" aria-hidden="true" />
      </header>

      {/* Hero Section: Responsive Two-Column Composition */}
      <main
        id="main-content"
        className="mx-auto my-auto w-full max-w-full lg:max-w-6xl xl:max-w-7xl min-w-0 py-8 sm:py-12 lg:py-16"
      >
        <div className="lg:grid lg:grid-cols-12 lg:gap-12 xl:gap-16 lg:items-center min-w-0 w-full">
          {/* Left Column: Headline, Differentiator, CTA */}
          <div className="space-y-6 text-left lg:col-span-6 xl:col-span-6 min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl md:text-5xl lg:text-[2.6rem] xl:text-[3.25rem] lg:leading-[1.14]">
              Interview scheduling that actually respects everyone&apos;s calendar.
            </h1>

            <p className="text-base leading-relaxed text-zinc-600 sm:text-lg">
              Deterministic, multi-party constraint orchestration. SIRA coordinates candidates,
              panelists, and working hours without back-and-forth emails or surprise calendar clashes.
            </p>

            {/* SIRA Differentiators */}
            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold mt-0.5">
                  ✓
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Explainable recommendations</p>
                  <p className="text-xs text-zinc-500">
                    Every recommended time explains the exact working hours, availability, and buffers satisfied.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold mt-0.5">
                  ✓
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Strict timezone accuracy</p>
                  <p className="text-xs text-zinc-500">
                    Pure IANA conversion with zero ad-hoc arithmetic. Displays live working hours in all participants&apos; zones.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold mt-0.5">
                  ✓
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Automated schedule recovery</p>
                  <p className="text-xs text-zinc-500">
                    If an interviewer declines, SIRA attempts same-time replacement first, or auto-rebooks from existing availability.
                  </p>
                </div>
              </div>
            </div>

            {/* Primary CTA and trust line */}
            <div className="pt-3 space-y-3">
              <div>
                <Link
                  href="/s/demo-dev"
                  className={buttonStyles("primary", "text-sm sm:text-base py-3 sm:py-3.5 px-6 sm:px-8 shadow-sm font-semibold w-full sm:w-auto inline-flex")}
                >
                  Experience Candidate Flow →
                </Link>
              </div>
              <p className="text-xs text-zinc-500">
                No candidate accounts required · Scoped secure link · 100% deterministic core
              </p>
            </div>

            {/* Quick links to demo scenarios */}
            <div className="pt-4 border-t border-zinc-200/70">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block mb-2">
                Candidate Scenarios
              </span>
              <div className="flex flex-wrap gap-2 text-xs w-full min-w-0">
                <Link
                  href="/s/demo-dev"
                  className="rounded-md border border-zinc-200 bg-white/80 px-2.5 py-1.5 text-zinc-700 hover:border-indigo-500 hover:text-indigo-700 transition"
                >
                  Dev Menon (Full flow)
                </Link>
                <Link
                  href="/s/demo-few"
                  className="rounded-md border border-zinc-200 bg-white/80 px-2.5 py-1.5 text-zinc-700 hover:border-indigo-500 hover:text-indigo-700 transition"
                >
                  Ethan Blake (2 ranked slots)
                </Link>
                <Link
                  href="/s/demo-ryan/reschedule"
                  className="rounded-md border border-zinc-200 bg-white/80 px-2.5 py-1.5 text-zinc-700 hover:border-indigo-500 hover:text-indigo-700 transition"
                >
                  Ryan Cole (Reschedule)
                </Link>
                <Link
                  href="/s/demo-expired"
                  className="rounded-md border border-zinc-200 bg-white/80 px-2.5 py-1.5 text-zinc-700 hover:border-indigo-500 hover:text-indigo-700 transition"
                >
                  Expired Link (Recovery)
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column: Large Interactive Desktop Product Preview */}
          <div className="mt-10 lg:mt-0 lg:col-span-6 xl:col-span-6 min-w-0">
            <div className="rounded-2xl border border-white/80 bg-white p-4 sm:p-6 lg:p-8 shadow-md">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  Recommended Interview Slot
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  Rank #1 · Fit 95
                </span>
              </div>

              {/* Context line */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                <span>Role: <strong className="text-zinc-800">Sr Frontend Engineer</strong></span>
                <span>Round: <strong className="text-zinc-800">Screening (30m)</strong></span>
              </div>

              {/* Timezone switcher */}
              <div className="mb-4">
                <TimezoneSelect value={timezone} onChange={setTimezone} />
                <p className="mt-1.5 text-xs text-zinc-500">
                  Time updates dynamically for candidate&apos;s timezone.
                </p>
              </div>

              {/* SlotCard */}
              <SlotCard
                slot={demoSlot}
                timezone={timezone}
                secondaryTimezone="Europe/London"
                selected={selected}
                onSelect={() => setSelected(!selected)}
              />

              {/* Why this time works checklist */}
              <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3.5 text-xs text-zinc-600 space-y-1.5">
                <p className="font-semibold text-zinc-800">Why this time is recommended:</p>
                <ul className="space-y-1">
                  {demoSlot.reasons.map((reason, index) => (
                    <li key={index} className="flex items-center gap-2 text-emerald-700">
                      <span aria-hidden="true" className="font-bold">✓</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5">
                <Link
                  href="/s/demo-dev"
                  className={buttonStyles("primary", "w-full text-center py-3 text-sm font-semibold")}
                >
                  Book this slot in candidate flow →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mx-auto flex w-full max-w-6xl xl:max-w-7xl flex-col sm:flex-row items-center justify-between gap-2 py-4 text-xs text-zinc-500 text-center sm:text-left">
        <span>SIRA · Smart Interview Rescheduling &amp; Availability</span>
        <span>Deterministic Core</span>
      </footer>
    </div>
  );
}
