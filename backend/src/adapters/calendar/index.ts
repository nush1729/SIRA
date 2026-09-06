import { env } from "../../config/env";
import { CalendarProvider } from "./CalendarProvider";
import { MockCalendarProvider } from "./MockCalendarProvider";
import { GoogleCalendarProvider } from "./GoogleCalendarProvider";

export * from "./CalendarProvider";

// Single switch point, driven by PROVIDER_MODE — nothing else in the codebase branches on
// sandbox-vs-live. This is what makes the demo immune to a live OAuth/API hiccup during judging
// (architecture doc Section 5.2, "Adapter interfaces").
export const calendarProvider: CalendarProvider =
  env.PROVIDER_MODE === "live" ? new GoogleCalendarProvider() : new MockCalendarProvider();
