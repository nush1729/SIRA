/**
 * ============================================================================
 *  Email copy. One place, so wording is reviewed once rather than scattered
 *  through route handlers.
 *
 *  Rules these follow:
 *   - A candidate email names a time, its timezone, and ONE action.
 *   - Candidates never see panel internals: no scores, no rejection reasons,
 *     no other interviewers' availability. They see times, not machinery.
 *   - Times are rendered in the recipient's own zone and always carry the
 *     zone label — never a bare "10:00 AM".
 * ============================================================================
 */

const BRAND = 'SIRA';

function fmt(iso: string, timezone: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  const zone =
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone, timeZoneName: 'short' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value ?? timezone;
  return `${day}, ${time} ${zone}`;
}

function range(startIso: string, endIso: string, timezone: string): string {
  const end = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(endIso));
  return `${fmt(startIso, timezone)} – ${end}`;
}

function layout(heading: string, paragraphs: string[], cta?: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.6">${p}</p>`).join('');
  const button = cta
    ? `<p style="margin:22px 0"><a href="${cta.url}" style="background:#4f46e5;color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${cta.label}</a></p>
       <p style="margin:0 0 14px;font-size:12px;color:#71717a">If the button doesn't work, paste this into your browser:<br>${cta.url}</p>`
    : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;max-width:560px">
  <h2 style="margin:0 0 16px;font-size:19px">${heading}</h2>
  ${body}${button}
  <p style="margin:26px 0 0;font-size:12px;color:#a1a1aa">Sent by ${BRAND}</p>
</div>`;
}

export type Mail = { template: string; subject: string; body: string };

/* -- 1. The invite. The only email a candidate gets before they can act. ---- */
export function availabilityRequest(p: {
  candidateName: string;
  jobTitle: string;
  roundType: string;
  durationMin: number;
  timezone: string;
  link: string;
  expiresAt?: Date;
  senderName?: string;
}): Mail {
  const expiry = p.expiresAt
    ? `This link is personal to you and expires on ${new Intl.DateTimeFormat('en-GB', {
        timeZone: p.timezone,
        day: 'numeric',
        month: 'long',
      }).format(p.expiresAt)}.`
    : 'This link is personal to you.';

  return {
    template: 'availability_request',
    subject: `Share your availability — ${p.jobTitle} interview`,
    body: layout(
      `Hi ${p.candidateName.split(' ')[0]}, let's find a time`,
      [
        `We'd like to schedule your <strong>${p.roundType.toLowerCase()}</strong> interview for <strong>${p.jobTitle}</strong> (${p.durationMin} minutes).`,
        `Pick the times that work for you — there's no account to create, and every time is shown in your own timezone (${p.timezone}).`,
        expiry,
      ],
      { label: 'Choose your times', url: p.link }
    ),
  };
}

/* -- 2. Confirmation --------------------------------------------------------- */
export function bookingConfirmed(p: {
  candidateName: string;
  jobTitle: string;
  roundType: string;
  durationMin: number;
  startUtc: string;
  endUtc: string;
  timezone: string;
  interviewerNames: string[];
  meetLink: string | null;
}): Mail {
  const when = range(p.startUtc, p.endUtc, p.timezone);
  const who = p.interviewerNames.length ? ` with ${p.interviewerNames.join(' and ')}` : '';
  return {
    template: 'booking_confirmed',
    subject: `Confirmed — ${fmt(p.startUtc, p.timezone)}`,
    body: layout(
      `You're booked in, ${p.candidateName.split(' ')[0]}`,
      [
        `<strong>${when}</strong>${who}.`,
        `${p.jobTitle} · ${p.roundType.toLowerCase()} · ${p.durationMin} minutes.`,
        `Need a different time? Use the same link you used to book and choose "I need to reschedule".`,
      ],
      p.meetLink ? { label: 'Join meeting', url: p.meetLink } : undefined
    ),
  };
}

/* -- 3. Panel assignment ----------------------------------------------------- */
export function interviewerAssigned(p: {
  interviewerName: string;
  candidateName: string;
  jobTitle: string;
  roundType: string;
  startUtc: string;
  endUtc: string;
  timezone: string;
  meetLink: string | null;
}): Mail {
  return {
    template: 'interviewer_booked',
    subject: `Interview scheduled — ${p.candidateName}, ${fmt(p.startUtc, p.timezone)}`,
    body: layout(
      `You're interviewing ${p.candidateName}`,
      [
        `<strong>${range(p.startUtc, p.endUtc, p.timezone)}</strong> (your time).`,
        `${p.jobTitle} · ${p.roundType.toLowerCase()}.`,
        `If you can't make it, decline from your SIRA console — we'll try to find cover at the same time before moving the candidate.`,
      ],
      p.meetLink ? { label: 'Join meeting', url: p.meetLink } : undefined
    ),
  };
}

/* -- 4. §6A-1: interviewer swapped, time unchanged --------------------------- */
export function interviewerChanged(p: {
  candidateName: string;
  newInterviewerName: string;
  startUtc: string;
  endUtc: string;
  timezone: string;
}): Mail {
  return {
    template: 'interviewer_swapped',
    subject: 'A small update to your interview',
    body: layout('Your interviewer has changed', [
      `You'll now be meeting <strong>${p.newInterviewerName}</strong>.`,
      `<strong>The time hasn't changed</strong> — ${range(p.startUtc, p.endUtc, p.timezone)}.`,
      'Nothing to do; your existing joining link still works.',
    ]),
  };
}

/* -- 5. §6A-2: moved to a new time from their own windows -------------------- */
export function interviewMoved(p: {
  candidateName: string;
  startUtc: string;
  endUtc: string;
  timezone: string;
  meetLink: string | null;
}): Mail {
  return {
    template: 'interview_moved',
    subject: `Your interview has moved — ${fmt(p.startUtc, p.timezone)}`,
    body: layout(
      'We had to move your interview',
      [
        `Your new time is <strong>${range(p.startUtc, p.endUtc, p.timezone)}</strong>.`,
        'We picked it from the availability you already gave us, so it should still suit you. If it does not, use your link to choose another.',
      ],
      p.meetLink ? { label: 'Join meeting', url: p.meetLink } : undefined
    ),
  };
}

/* -- 6. §6B: nothing worked -------------------------------------------------- */
export function rescheduleRequired(p: { candidateName: string; jobTitle: string; link: string }): Mail {
  return {
    template: 'reschedule_required_candidate',
    subject: `We need to find a new time — ${p.jobTitle}`,
    body: layout(
      'Let’s find another time',
      [
        `Hi ${p.candidateName.split(' ')[0]}, none of the times you gave us still work for the panel.`,
        'Please pick a few fresh options and we’ll get it confirmed.',
      ],
      { label: 'Choose new times', url: p.link }
    ),
  };
}

/* -- 7. Cancellation ---------------------------------------------------------- */
export function interviewCancelled(p: {
  name: string;
  jobTitle: string;
  startUtc: string;
  timezone: string;
  reason?: string | null;
}): Mail {
  return {
    template: 'booking_cancelled',
    subject: `Cancelled — ${p.jobTitle} interview`,
    body: layout('Your interview has been cancelled', [
      `The interview scheduled for ${fmt(p.startUtc, p.timezone)} is no longer going ahead.`,
      p.reason ? `Reason given: ${p.reason}` : 'The calendar invitation has been removed.',
      'If this was unexpected, reply to this email and the team will pick it up.',
    ]),
  };
}
