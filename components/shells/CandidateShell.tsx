import Link from "next/link";
import type { ReactNode } from "react";

export interface CandidateShellProps {
  children: ReactNode;
  header?: ReactNode;
  step?: 1 | 2 | 3;
  backHref?: string;
  backLabel?: string;
  cardClassName?: string;
}

export function CandidateShell({
  children,
  header,
  step,
  backHref,
  backLabel = "Back",
  cardClassName,
}: CandidateShellProps) {
  const containerWidth = cardClassName ?? "max-w-md sm:max-w-2xl lg:max-w-5xl xl:max-w-6xl";

  return (
    <div className="candidate-background flex min-h-dvh flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Top Header Bar */}
      <header
        className={`mx-auto flex w-full items-center justify-between gap-4 px-1 ${containerWidth}`}
      >
        <Link
          href="/"
          className="text-xl font-semibold tracking-[-.06em] text-indigo-950 hover:opacity-80 transition"
          aria-label="SIRA home"
        >
          sira<span className="text-indigo-600">.</span>
        </Link>
        <span className="text-xs font-medium tracking-wide text-indigo-950/65">
          INTERVIEW SCHEDULING
        </span>
      </header>

      {/* Main Centered / Responsive Content */}
      <main id="main-content" className="my-auto flex w-full justify-center py-6 sm:py-8 lg:py-10">
        <div
          className={`enter w-full min-w-0 rounded-2xl border border-white/80 bg-white p-6 shadow-sm sm:p-8 lg:p-10 ${containerWidth}`}
        >
          {/* Back navigation link */}
          {backHref && (
            <Link
              href={backHref}
              className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-zinc-600 hover:text-indigo-700 transition"
            >
              <span aria-hidden="true">←</span>
              {backLabel}
            </Link>
          )}

          {/* Booking Progress Step Indicator */}
          {step && (
            <ol
              aria-label="Booking progress"
              className="mb-8 grid grid-cols-3 gap-3 border-b border-zinc-100 pb-4"
            >
              {[
                { num: 1, label: "Your days" },
                { num: 2, label: "Your time" },
                { num: 3, label: "Confirmed" },
              ].map((item) => {
                const isActive = step === item.num;
                const isCompleted = step > item.num;
                return (
                  <li
                    key={item.label}
                    aria-current={isActive ? "step" : undefined}
                    className={`border-t-2 pt-2 text-xs transition-colors ${
                      isActive
                        ? "border-indigo-600 font-semibold text-indigo-700"
                        : isCompleted
                        ? "border-indigo-300 font-medium text-zinc-700"
                        : "border-zinc-200 text-zinc-500"
                    }`}
                  >
                    <span className="block sm:inline">{item.num}. </span>
                    <span className="truncate">{item.label}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {header && <div className="mb-6">{header}</div>}

          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-indigo-950/65">
        A little less scheduling. A little more possibility.
      </footer>
    </div>
  );
}
