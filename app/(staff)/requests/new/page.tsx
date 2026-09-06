"use client";

/**
 * Role C — /requests/new (docs/09 §4).
 * One column, three blocks: Candidate · Round · Window, with the live
 * eligibility panel alongside. Submit -> createRequest() -> the detail page.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Chip, Field, Input, Select } from "@/components/staff/kit";
import { EligibilityPanel } from "@/components/staff/EligibilityPanel";
import { ToastHost, useToasts } from "@/components/staff/ToastHost";
import { COMMON_TIMEZONES, ROUND_LABEL, zoneCity } from "@/components/staff/format";
import { useDebounced } from "@/components/staff/useAsync";
import { ApiError, createRequest, listKnownCandidates, previewPanel } from "@/lib/api-client";
import type { KnownCandidate } from "@/lib/api-client";
import { AdminOnly } from "@/components/staff/AdminOnly";
import { SKILL_OPTIONS } from "@/mocks/staff-fixtures";
import type { RoundType, SelectionResult } from "@/lib/contracts";

const ROUNDS: RoundType[] = ["SCREENING", "TECHNICAL", "MANAGERIAL", "HR"];
const DURATIONS = [30, 45, 60];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function NewRequestPage() {
  // Creating an interview request is scheduling — admins only.
  return (
    <AdminOnly>
      <NewRequestForm />
    </AdminOnly>
  );
}

function NewRequestForm() {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();

  /* -- candidate ---------------------------------------------------------- */
  const [candidates, setCandidates] = React.useState<KnownCandidate[]>([]);
  const [mode, setMode] = React.useState<"existing" | "new">("existing");
  const [candidateId, setCandidateId] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [newTz, setNewTz] = React.useState("Asia/Kolkata");

  /* -- round -------------------------------------------------------------- */
  const [jobTitle, setJobTitle] = React.useState("");
  /** True while jobTitle is whatever the picked candidate applied for. */
  const [jobAutoFilled, setJobAutoFilled] = React.useState(false);
  const [roundType, setRoundType] = React.useState<RoundType>("TECHNICAL");
  const [durationMin, setDurationMin] = React.useState(60);
  const [skills, setSkills] = React.useState<string[]>(["Java", "Backend"]);
  const [panelSize, setPanelSize] = React.useState(1);

  /* -- window ------------------------------------------------------------- */
  const today = React.useMemo(() => new Date(), []);
  const [from, setFrom] = React.useState(() => isoDate(today));
  const [to, setTo] = React.useState(() => isoDate(new Date(today.getTime() + 14 * 86_400_000)));

  /* -- form state --------------------------------------------------------- */
  const [touched, setTouched] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    listKnownCandidates()
      .then((list) => {
        setCandidates(list);
        setCandidateId((id) => id || (list[0]?.id ?? ""));
      })
      .catch(() => push("Could not load existing candidates — you can still add one inline.", "warn"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const picked = React.useMemo(
    () => candidates.find((c) => c.id === candidateId) ?? null,
    [candidates, candidateId]
  );

  /**
   * Pick a candidate -> the role they applied for fills itself in, along with
   * the round they were last up for. Typing over it stops the auto-fill, so we
   * never clobber something the admin wrote on purpose.
   */
  React.useEffect(() => {
    if (mode !== "existing" || !picked) return;
    if (jobTitle.trim() === "" || jobAutoFilled) {
      setJobTitle(picked.appliedFor);
      setJobAutoFilled(true);
      if (picked.lastRoundType) setRoundType(picked.lastRoundType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.id, mode]);

  /* -- eligibility preview, debounced on round/skills/window/size --------- */
  const [selection, setSelection] = React.useState<SelectionResult | null>(null);
  const [selLoading, setSelLoading] = React.useState(true);
  const [selError, setSelError] = React.useState<string | null>(null);

  const previewKey = useDebounced(
    JSON.stringify({ roundType, skills, panelSize, durationMin, from, to }),
    350
  );

  React.useEffect(() => {
    let cancelled = false;
    setSelLoading(true);
    setSelError(null);
    previewPanel({
      roundType,
      requiredSkills: skills,
      panelSize,
      durationMin,
      window: { start: new Date(from).toISOString(), end: new Date(to).toISOString() },
    })
      .then((r) => {
        if (!cancelled) setSelection(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setSelError(e instanceof ApiError ? e.message : "Could not preview the panel.");
      })
      .finally(() => {
        if (!cancelled) setSelLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  /* -- validation --------------------------------------------------------- */
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
  const errors = {
    candidate:
      mode === "existing"
        ? candidateId
          ? undefined
          : "Choose a candidate"
        : !newName.trim()
          ? "Enter the candidate's name"
          : !emailOk
            ? "Enter a valid email address"
            : undefined,
    jobTitle: jobTitle.trim() ? undefined : "Enter the job title",
    window: Date.parse(to) >= Date.parse(from) ? undefined : "The end date must be after the start date",
  };
  const valid = !errors.candidate && !errors.jobTitle && !errors.window;

  async function submit(sendAvailabilityRequest: boolean) {
    setTouched(true);
    if (!valid) return;
    setSubmitting(true);
    try {
      const detail = await createRequest({
        candidateId: mode === "existing" ? candidateId : undefined,
        newCandidate:
          mode === "new"
            ? { name: newName.trim(), email: newEmail.trim(), timezone: newTz }
            : undefined,
        jobTitle: jobTitle.trim(),
        roundType,
        durationMin,
        requiredSkills: skills,
        panelSize,
        window: { start: new Date(from).toISOString(), end: new Date(to).toISOString() },
        sendAvailabilityRequest,
      });
      router.push(`/requests/${detail.id}`);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Could not create the request.", "danger");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Back to pipeline
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">New interview request</h1>
        <p className="mt-1 text-sm text-zinc-500">
          SIRA picks the panel as you type, and tells you who it ruled out and why.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit(true);
          }}
        >
          {/* -- 1. Candidate -------------------------------------------- */}
          <Card title="Candidate" subtitle="Who are you interviewing?">
            <div className="mb-4 inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
              {(["existing", "new"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={
                    mode === m
                      ? "rounded-[5px] bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-900 shadow-sm"
                      : "rounded-[5px] px-3 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-800"
                  }
                >
                  {m === "existing" ? "Existing candidate" : "Add new"}
                </button>
              ))}
            </div>

            {mode === "existing" ? (
              <Field
                label="Candidate"
                htmlFor="candidate"
                error={touched ? errors.candidate : undefined}
                hint={picked ? `${picked.email} · ${zoneCity(picked.timezone)}` : undefined}
              >
                <Select id="candidate" value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
                  <option value="">Select a candidate…</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.appliedFor || "no application yet"} ({zoneCity(c.timezone)})
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="cname" error={touched && !newName.trim() ? "Enter the candidate's name" : undefined}>
                  <Input id="cname" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Maya Iyer" />
                </Field>
                <Field label="Email" htmlFor="cemail" error={touched && !emailOk ? "Enter a valid email address" : undefined}>
                  <Input id="cemail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="maya@example.com" />
                </Field>
                <Field label="Timezone" htmlFor="ctz" hint="Every time they see will be in this zone.">
                  <Select id="ctz" value={newTz} onChange={(e) => setNewTz(e.target.value)}>
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </Card>

          {/* -- 2. Round ------------------------------------------------- */}
          <Card title="Round" subtitle="What kind of interview, and who needs to be in it?">
            <div className="space-y-5">
              <Field
                label="Job title"
                htmlFor="job"
                error={touched ? errors.jobTitle : undefined}
                hint={
                  jobAutoFilled && picked?.appliedFor
                    ? `Filled in from ${picked.name.split(" ")[0]}'s application — edit it if this round is for a different role.`
                    : undefined
                }
              >
                <Input
                  id="job"
                  value={jobTitle}
                  onChange={(e) => {
                    setJobTitle(e.target.value);
                    setJobAutoFilled(false);
                  }}
                  placeholder="Sr Backend Engineer"
                />
              </Field>

              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-zinc-700">Round type</span>
                <div className="flex flex-wrap gap-2">
                  {ROUNDS.map((r) => (
                    <Chip key={r} selected={roundType === r} onClick={() => setRoundType(r)}>
                      {ROUND_LABEL[r]}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-zinc-700">Duration</span>
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map((d) => (
                    <Chip key={d} selected={durationMin === d} onClick={() => setDurationMin(d)}>
                      {d} min
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-zinc-700">Required skills</span>
                <div className="flex flex-wrap gap-2">
                  {SKILL_OPTIONS.map((s) => (
                    <Chip
                      key={s}
                      selected={skills.includes(s)}
                      onClick={() =>
                        setSkills((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
                      }
                    >
                      {s}
                    </Chip>
                  ))}
                </div>
                <p className="text-xs text-zinc-500">
                  An interviewer must have <strong>every</strong> selected skill to qualify.
                </p>
              </div>

              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-zinc-700">Panel size</span>
                <div className="flex flex-wrap gap-2">
                  {[1, 2].map((n) => (
                    <Chip key={n} selected={panelSize === n} onClick={() => setPanelSize(n)}>
                      {n} interviewer{n > 1 ? "s" : ""}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* -- 3. Window ------------------------------------------------ */}
          <Card title="Window" subtitle="How far out may this be scheduled? Defaults to the next two weeks.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From" htmlFor="from">
                <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To" htmlFor="to" error={touched ? errors.window : undefined}>
                <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
          </Card>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant="primary" loading={submitting} disabled={!valid && touched}>
              Create &amp; send availability request
            </Button>
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => submit(false)}>
              Create as draft
            </Button>
          </div>
        </form>

        <div className="lg:order-last">
          <EligibilityPanel result={selection} loading={selLoading} error={selError} panelSize={panelSize} />
        </div>
      </div>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
