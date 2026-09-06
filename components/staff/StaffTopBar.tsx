"use client";

/**
 * Role C — the sticky staff top bar (docs/09 §1):
 * SIRA wordmark · nav · role-aware avatar menu · Reset demo data (admin).
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Dialog, cx } from "@/components/staff/kit";
import { SiraLogo } from "@/components/ui/SiraLogo";
import { avatarTone, initials, zoneCity } from "@/components/staff/format";
import type { SessionDTO } from "@/lib/contracts";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  INTERVIEWER: "Interviewer",
};

export function StaffTopBar({
  me,
  onSignOut,
  onResetDemo,
  resetting,
}: {
  me: SessionDTO;
  onSignOut: () => void;
  onResetDemo: () => void;
  resetting: boolean;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  // Admins schedule; interviewers respond. The nav says which job you're doing.
  const isAdmin = me.role === "ADMIN";
  const nav = isAdmin
    ? [
        { href: "/dashboard", label: "Pipeline" },
        { href: "/interviewer", label: "Scheduled" },
      ]
    : [{ href: "/interviewer", label: "My interviews" }];
  const canSeePipeline = isAdmin;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/80 shadow-[0_1px_0_0_rgba(24,24,27,0.03)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link
            href={canSeePipeline ? "/dashboard" : "/interviewer"}
            className="flex items-center rounded-md"
            aria-label="SIRA home"
          >
            <SiraLogo size={28} />
          </Link>

          <span className="mx-1 hidden h-5 w-px bg-zinc-200 sm:block" aria-hidden />

          <nav className="flex items-center gap-1">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition duration-120",
                    active
                      ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {me.role === "ADMIN" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmReset(true)}
                loading={resetting}
                className="hidden sm:inline-flex"
              >
                Reset demo data
              </Button>
            )}

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-zinc-100"
              >
                <span
                  className={cx(
                    "grid h-8 w-8 place-items-center rounded-full text-[12px] font-semibold ring-1",
                    avatarTone(me.name)
                  )}
                >
                  {initials(me.name)}
                </span>
                <span className="hidden text-sm font-medium text-zinc-700 sm:inline">{me.name.split(" ")[0]}</span>
                <span className="text-zinc-400" aria-hidden>
                  ▾
                </span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 animate-fade-in overflow-hidden rounded-xl bg-white shadow-xl shadow-zinc-900/10 ring-1 ring-zinc-200"
                >
                  <div className="border-b border-zinc-100 px-4 py-3">
                    <p className="text-sm font-semibold text-zinc-900">{me.name}</p>
                    <p className="truncate text-xs text-zinc-500">{me.email}</p>
                    <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-indigo-600">
                      {ROLE_LABEL[me.role] ?? me.role} · {zoneCity(me.timezone)}
                    </p>
                  </div>
                  {me.role === "ADMIN" && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmReset(true);
                      }}
                      className="block w-full px-4 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50 sm:hidden"
                    >
                      Reset demo data
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={onSignOut}
                    className="block w-full px-4 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <Dialog
        open={confirmReset}
        title="Reset demo data?"
        description="This wipes and rebuilds the whole demo dataset — every request returns to its seeded state and the candidate links keep working."
        onClose={() => setConfirmReset(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={resetting}
              onClick={() => {
                setConfirmReset(false);
                onResetDemo();
              }}
            >
              Reset data
            </Button>
          </>
        }
      />
    </>
  );
}
