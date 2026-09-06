"use client";

/**
 * Role C — scheduling is admin-only.
 *
 * This hides what an interviewer can't do and explains why. It is NOT the
 * access control: B enforces the same rule server-side (403 FORBIDDEN), and
 * that is what actually protects the data. Never treat this as security.
 */

import Link from "next/link";
import { Button, EmptyState } from "@/components/staff/kit";
import { useStaffSession } from "@/components/staff/session";

export function useIsAdmin(): boolean {
  return useStaffSession().role === "ADMIN";
}

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const isAdmin = useIsAdmin();
  if (isAdmin) return <>{children}</>;

  return (
    <EmptyState
      icon="🔒"
      title="Only admins can schedule interviews"
      body="You can see the interviews you're on the panel for, respond to them, and check your calendar."
      action={
        <Link href="/interviewer">
          <Button variant="primary">Go to my interviews</Button>
        </Link>
      }
    />
  );
}
