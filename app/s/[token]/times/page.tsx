"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CandidateShell } from "@/components/shells/CandidateShell";
import { Button, buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/Skeleton";
import { SlotCard } from "@/components/ui/SlotCard";
import { TimezoneSelect } from "@/components/ui/TimezoneSelect";
import { Toast } from "@/components/ui/Toast";
import { formatSlotTime } from "@/components/ui/format-time";
import {
  bookPublicSlot,
  getPublicRequest,
  getPublicSlots,
  triggerConflictOnNextBooking,
} from "@/lib/api-public";
import type { GeneratedSlot, PublicRequestDTO } from "@/lib/contracts";

function TimesContent() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = params?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<PublicRequestDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialTz = searchParams.get("tz");
  const [timezone, setTimezone] = useState(initialTz || "America/New_York");
  const [slots, setSlots] = useState<GeneratedSlot[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [isBooking, setIsBooking] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;

    async function load() {
      const [reqRes, slotsRes] = await Promise.all([
        getPublicRequest(token),
        getPublicSlots(token),
      ]);

      if (!active) return;

      if (!reqRes.ok) {
        setError(reqRes.error.message || "This link has expired — please contact your recruiter.");
        setLoading(false);
        return;
      }

      setRequest(reqRes.data);
      if (!initialTz && reqRes.data.candidateTimezone) {
        setTimezone(reqRes.data.candidateTimezone);
      }

      if (slotsRes.ok) {
        setSlots(slotsRes.data.slots);
        setSelectedSlotIndex(0);
      } else {
        setError(slotsRes.error.message || "Failed to load available times.");
      }
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [token, initialTz]);

  async function handleBook() {
    const selectedSlot = slots[selectedSlotIndex];
    if (!selectedSlot || !token) return;

    setIsBooking(true);
    setToastMessage(null);

    const res = await bookPublicSlot(token, selectedSlot.start, selectedSlot.end);

    if (res.ok) {
      router.push(`/s/${encodeURIComponent(token)}/confirmed?tz=${encodeURIComponent(timezone)}`);
    } else {
      setIsBooking(false);
      if (res.error.code === "SLOT_NO_LONGER_VALID") {
        setToastMessage("That time was just taken. Please choose another.");
        // Refetch latest slots immediately so the candidate can choose again
        const refreshRes = await getPublicSlots(token);
        if (refreshRes.ok) {
          setSlots(refreshRes.data.slots);
          setSelectedSlotIndex(0);
        }
      } else {
        setToastMessage(res.error.message || "Could not confirm this time. Please try another.");
      }
    }
  }

  function handleSimulateConflict() {
    triggerConflictOnNextBooking(token);
    setToastMessage("Conflict simulation armed: Your next booking attempt will simulate SLOT_NO_LONGER_VALID.");
  }

  if (loading) {
    return (
      <CandidateShell step={2} backHref={`/s/${encodeURIComponent(token)}/days`}>
        <LoadingState label="Finding the best times for you and the team…" />
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

  const selectedSlot = slots[selectedSlotIndex];
  const selectedFormatted = selectedSlot ? formatSlotTime(selectedSlot, timezone) : null;

  return (
    <CandidateShell
      step={2}
      backHref={`/s/${encodeURIComponent(token)}/days`}
      backLabel="Days"
    >
      <div className="space-y-6">
        {/* Toast for conflict recovery / errors */}
        {toastMessage && (
          <Toast
            message={toastMessage}
            onDismiss={() => setToastMessage(null)}
            tone={toastMessage.includes("taken") ? "error" : "info"}
          />
        )}

        <div className="lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start">
          {/* Left Column: Context, Timezone Switcher, Selected Preview, Confirmation CTA */}
          <div className="space-y-6 lg:col-span-5 xl:sticky xl:top-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Step 2 of 2 · Select time
              </p>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">
                Choose a time that works
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                Ranked options verified against working hours, interviewer availability, and required meeting buffers.
              </p>
            </div>

            {/* Timezone Switcher */}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-2">
              <TimezoneSelect value={timezone} onChange={setTimezone} />
              <p className="text-xs text-zinc-500">
                Times update immediately when switching timezones.
              </p>
            </div>

            {/* Selected Slot Callout & Primary Action */}
            {selectedSlot && selectedFormatted && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4.5 space-y-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
                    Selected Time
                  </span>
                  <p className="mt-1 text-base font-bold text-zinc-950 sm:text-lg">
                    {selectedFormatted.date}
                  </p>
                  <p className="text-sm font-semibold text-indigo-700">
                    {selectedFormatted.time}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {timezone.replaceAll("_", " ")}
                  </p>
                </div>

                <Button
                  onClick={handleBook}
                  disabled={isBooking}
                  loading={isBooking}
                  loadingText="Confirming your interview…"
                  className="w-full text-base py-3"
                >
                  Confirm interview →
                </Button>
              </div>
            )}

            {/* Discreet Development-only conflict trigger */}
            <div className="pt-3 border-t border-zinc-100 text-xs text-zinc-400 space-y-1">
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400 block">
                Dev Tool
              </span>
              <button
                type="button"
                onClick={handleSimulateConflict}
                className="text-xs text-zinc-500 hover:text-indigo-600 underline"
              >
                Simulate slot conflict (SLOT_NO_LONGER_VALID)
              </button>
            </div>
          </div>

          {/* Right Column: Ranked Slot Cards or Empty State */}
          <div className="mt-8 lg:mt-0 lg:col-span-7">
            {slots.length === 0 ? (
              <EmptyState
                tone="warning"
                title="No times work"
                description="We couldn't find any available times that fit within working hours and the team's calendar. Please contact your recruiter to coordinate fresh availability."
                action={
                  <Link
                    href={`/s/${encodeURIComponent(token)}/days`}
                    className={buttonStyles("secondary", "mt-3")}
                  >
                    ← Try different days
                  </Link>
                }
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Available Times ({slots.length})
                  </span>
                  <span className="text-xs font-medium text-indigo-600">
                    Ranked by constraint fit
                  </span>
                </div>

                <div className="space-y-3">
                  {slots.map((slot, index) => {
                    const isSelected = selectedSlotIndex === index;
                    return (
                      <SlotCard
                        key={`${slot.start}-${index}`}
                        slot={slot}
                        timezone={timezone}
                        audience="candidate"
                        selected={isSelected}
                        onSelect={() => setSelectedSlotIndex(index)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </CandidateShell>
  );
}

export default function CandidateTimesPage() {
  return (
    <Suspense
      fallback={
        <CandidateShell step={2}>
          <LoadingState label="Loading available times…" />
        </CandidateShell>
      }
    >
      <TimesContent />
    </Suspense>
  );
}
