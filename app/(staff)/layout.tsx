"use client";

/**
 * Role C — staff shell (docs/09 §1).
 * Top bar + container + auth redirect. `/login` opts out of the chrome.
 */

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { getMe, logout, resetDemoData } from "@/lib/api-client";
import { StaffTopBar } from "@/components/staff/StaffTopBar";
import { ToastHost, useToasts } from "@/components/staff/ToastHost";
import { SiraLogo } from "@/components/ui/SiraLogo";
import { StaffSessionProvider } from "@/components/staff/session";
import { Skeleton } from "@/components/ui";
import type { SessionDTO } from "@/lib/contracts";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";

  const [me, setMe] = React.useState<SessionDTO | null>(null);
  const [checking, setChecking] = React.useState(true);
  const [resetting, setResetting] = React.useState(false);
  const { toasts, push, dismiss } = useToasts();

  React.useEffect(() => {
    if (isLogin) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    getMe()
      .then((s) => {
        if (!cancelled) setMe(s);
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLogin, pathname, router]);

  async function handleSignOut() {
    await logout();
    router.replace("/login");
  }

  async function handleReset() {
    setResetting(true);
    try {
      const summary = await resetDemoData();
      const total = Object.values(summary.counts).reduce((a, b) => a + b, 0);
      push(`Demo data reset — ${total} records rebuilt.`, "success");
      router.refresh();
      window.location.reload();
    } catch {
      push("Could not reset the demo data. Try again.", "danger");
      setResetting(false);
    }
  }

  if (isLogin) return <>{children}</>;

  if (checking || !me) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="flex h-14 items-center gap-3 border-b border-zinc-200 bg-white px-4 sm:px-6">
          <SiraLogo size={28} />
        </div>
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <StaffTopBar me={me} onSignOut={handleSignOut} onResetDemo={handleReset} resetting={resetting} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <StaffSessionProvider value={me}>{children}</StaffSessionProvider>
      </main>
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
