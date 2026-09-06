"use client";

/**
 * Role C — /login (docs/09 §2).
 * Centred card. Inline error that never says which field was wrong.
 * Routes by role: INTERVIEWER -> /interviewer, everyone else -> /dashboard.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { SiraLogo, SiraMark } from "@/components/ui/SiraLogo";
import { ApiError, getMe, login } from "@/lib/api-client";
import { demoLogins, DEMO_PASSWORD } from "@/mocks/staff-fixtures";

const homeFor = (role: string) => (role === "INTERVIEWER" ? "/interviewer" : "/dashboard");

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const missing = !email.trim() || !password;

  // Already signed in? Don't make them type it again.
  React.useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) router.replace(homeFor(me.role));
      })
      .catch(() => {
        /* not signed in — stay here */
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (missing) return;
    setPending(true);
    setError(null);
    try {
      const me = await login(email, password);
      router.replace(homeFor(me.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Incorrect email or password");
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ── brand panel (desktop only) ────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-zinc-950 px-12 py-14 lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(600px 400px at 15% 10%, rgba(99,102,241,.55), transparent 65%), radial-gradient(560px 380px at 85% 85%, rgba(139,92,246,.42), transparent 65%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <SiraMark size={38} />
          <span className="text-lg font-semibold tracking-[0.2em] text-white">SIRA</span>
        </div>

        <div className="relative mt-auto max-w-md">
          <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-white">
            Interview scheduling that actually respects everyone&apos;s calendar.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Candidates, panels, working hours, buffers and timezones — solved together, and every
            recommendation explains itself.
          </p>

          {/* A slot card, the product's core idea, as the single visual. */}
          <div className="mt-8 rounded-xl bg-white/95 p-4 shadow-2xl ring-1 ring-white/20 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-zinc-900">Tue 14 Nov · 3:00 – 4:00 PM IST</p>
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Rank #1
              </span>
            </div>
            <p className="mt-0.5 text-[13px] text-zinc-500">1:30 – 2:30 PM your time</p>
            <ul className="mt-3 space-y-1.5">
              {[
                "Candidate available",
                "Priya Sharma free",
                "Within working hours in both zones",
                "15-min buffer respected",
              ].map((r) => (
                <li key={r} className="flex items-center gap-2 text-[13px] text-zinc-600">
                  <span className="text-emerald-600" aria-hidden>
                    ✓
                  </span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="relative mt-10 text-xs text-zinc-500">
          Deterministic core · No black-box &ldquo;best time&rdquo;
        </p>
      </aside>

      {/* ── form ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col bg-zinc-50">
        {/* SIRA mark sits at the top of this page too — it has no staff shell. */}
        <div className="flex h-14 items-center px-4 sm:px-6 lg:hidden">
          <SiraLogo size={28} />
        </div>

        <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
          <div className="w-full max-w-sm animate-rise">
            <div className="mb-6 text-center lg:text-left">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Welcome back</h1>
              <p className="mt-1.5 text-sm text-zinc-500">Sign in to your SIRA workspace.</p>
            </div>

            <form
              onSubmit={onSubmit}
              noValidate
              className="space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-zinc-200/80"
            >
              <Field
                label="Work email"
                htmlFor="email"
                error={touched && !email.trim() ? "Enter your email address" : undefined}
              >
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={pending}
                  autoFocus
                />
              </Field>

              <Field
                label="Password"
                htmlFor="password"
                error={touched && !password ? "Enter your password" : undefined}
              >
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={pending}
                />
              </Field>

              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200"
                >
                  <span aria-hidden>⚠</span>
                  {error}
                </p>
              )}

              <Button type="submit" variant="primary" loading={pending} className="w-full">
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <DemoAccounts
              onPick={(e) => {
                setEmail(e);
                setPassword(DEMO_PASSWORD);
                setError(null);
              }}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

const ROLE_TONE: Record<string, string> = {
  ADMIN: "bg-indigo-50 text-indigo-700",
  INTERVIEWER: "bg-emerald-50 text-emerald-700",
};

function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mt-5 overflow-hidden rounded-xl bg-white/70 ring-1 ring-zinc-200/80">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-zinc-600 transition hover:bg-white"
      >
        Demo accounts — one click to fill
        <span className="text-zinc-400 transition" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <ul className="animate-fade-in border-t border-zinc-100 p-2">
          {demoLogins.map((l) => (
            <li key={l.email}>
              <button
                type="button"
                onClick={() => onPick(l.email)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-xs transition hover:bg-zinc-50"
              >
                <span className="truncate text-zinc-700">{l.email}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    ROLE_TONE[l.role] ?? "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {l.role.replace("_", " ")}
                </span>
              </button>
            </li>
          ))}
          <li className="px-2 pb-1 pt-2 text-[11px] text-zinc-500">
            Password for every demo account:{" "}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-700">{DEMO_PASSWORD}</code>
          </li>
        </ul>
      )}
    </div>
  );
}
