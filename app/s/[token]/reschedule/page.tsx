"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  getRescheduleSlots,
} from "@/lib/api-public";
import type { GeneratedSlot, PublicRequestDTO } from "@/lib/contracts";

export default function CandidateReschedulePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<PublicRequestDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [timezone, setTimezone] = useState("America/New_York");
  const [slots, setSlots] = useState<GeneratedSlot[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [isBooking, setIsBooking] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;

    async function load() {
      const [reqRes, rescheduleRes] = await Promise.all([
        getPublicRequest(token),
        getRescheduleSlots(token),
      ]);

      if (!active) return;

      if (!reqRes.ok) {
        setError(reqRes.error.message || "This link has expired.");
        setLoading(false);
        return;
      }

      setRequest(reqRes.data);
      if (reqRes.data.candidateTimezone) {
        setTimezone(reqRes.data.candidateTimezone);
      }

      if (rescheduleRes.ok) {
        setSlots(rescheduleRes.data.slots);
        setSelectedSlotIndex(0);
      } else {
        setError(rescheduleRes.error.message || "Failed to load reschedule options.");
      }
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [token]);

  async function handleConfirmReschedule() {
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
        setToastMessage("That time was just taken. Please choose another available slot.");
        const refreshRes = await getRescheduleSlots(token);
        if (refreshRes.ok) {
          setSlots(refreshRes.data.slots);
          setSelectedSlotIndex(0);
        }
      } else {
        setToastMessage(res.error.message || "Could not re-book this time. Please try another.");
      }
    }
  }

  if (loading) {
    return (
      <CandidateShell backHref={`/s/${encodeURIComponent(token)}/confirmed`}>
        <LoadingState label="Checking for available times from your existing windows…" />
      </CandidateShell>
    );
  }

  if (error || !request) {
    return (
      <CandidateShell cardClassName="max-w-md sm:max-w-xl">
        <EmptyState
          tone="warning"
          title="Unable to load reschedule options"
          description={error || "This link has expired or is invalid."}
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
      backHref={`/s/${encodeURIComponent(token)}/confirmed`}
      backLabel="Current confirmation"
      cardClassName={slots.length === 0 ? "max-w-md sm:max-w-xl lg:max-w-2xl" : undefined}
    >
      <div className="space-y-6">
        {toastMessage && (
          <Toast
            message={toastMessage}
            onDismiss={() => setToastMessage(null)}
            tone={toastMessage.includes("taken") ? "error" : "info"}
          />
        )}

        {slots.length === 0 ? (
          /* Focused Empty State for demo-ryan: no unsupported actions */
          <div className="mx-auto max-w-xl py-4">
            <EmptyState
              tone="warning"
              title="None of your earlier times are still available"
              description="None of your earlier times are still available. We've let the recruiting team know and they'll send you fresh options."
              action={
                <div className="pt-2">
                  <Link
                    href={`/s/${encodeURIComponent(token)}/confirmed`}
                    className={buttonStyles("secondary", "text-sm")}
                  >
                    View current booking details
                  </Link>
                </div>
              }
            />
          </div>
        ) : (
          /* Two-Column Responsive Layout When Slots Exist */
          <div className="lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start">
            {/* Left Column: Context, Timezone, Selected Preview, CTA */}
            <div className="space-y-6 lg:col-span-5 xl:sticky xl:top-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  Reschedule interview
                </p>
                <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">
                  Let&apos;s find another time.
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  These options come from the availability you already gave us. No need to re-enter your schedule.
                </p>
              </div>

              {/* Timezone Switcher */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-2">
                <TimezoneSelect value={timezone} onChange={setTimezone} />
                <p className="text-xs text-zinc-500">
                  All times rendered in{" "}
                  <span className="font-semibold text-zinc-800">{timezone.replaceAll("_", " ")}</span>.
                </p>
              </div>

              {/* Selected Slot Callout & Action */}
              {selectedSlot && selectedFormatted && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4.5 space-y-4">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
                      New Proposed Time
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
                    onClick={handleConfirmReschedule}
                    disabled={isBooking || !selectedSlot}
                    loading={isBooking}
                    loadingText="Updating your interview…"
                    className="w-full py-3 text-base"
                  >
                    Confirm new time →
                  </Button>
                </div>
              )}
            </div>

            {/* Right Column: Alternative Slots */}
            <div className="mt-8 lg:mt-0 lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Alternative Times ({slots.length})
                </span>
                <span className="text-xs font-medium text-indigo-600">
                  From your existing availability
                </span>
              </div>

              <div className="space-y-3">
                {slots.map((slot, index) => (
                  <SlotCard
                    key={`${slot.start}-${index}`}
                    slot={slot}
                    timezone={timezone}
                    audience="candidate"
                    selected={selectedSlotIndex === index}
                    onSelect={() => setSelectedSlotIndex(index)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </CandidateShell>
  );
}
