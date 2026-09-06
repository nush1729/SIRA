"use client";

/** Role C — the signed-in staff user, shared with every page under the shell. */

import * as React from "react";
import type { SessionDTO } from "@/lib/contracts";

const StaffSessionContext = React.createContext<SessionDTO | null>(null);

export function StaffSessionProvider({
  value,
  children,
}: {
  value: SessionDTO;
  children: React.ReactNode;
}) {
  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}

/** Viewer identity + timezone — that second one is feature 16 on every screen. */
export function useStaffSession(): SessionDTO {
  const ctx = React.useContext(StaffSessionContext);
  if (!ctx) throw new Error("useStaffSession must be used inside the staff layout");
  return ctx;
}
