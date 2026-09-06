import prisma from '@/lib/db';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { generateSlots, pickPanel } from '@/lib/engine';
import { sendNotification } from '@/lib/notify';
import { RescheduleOutcome, EngineParticipant, EngineConfig, RoundType } from '@/lib/contracts';

export async function processReschedule(requestId: string, declinerId?: string): Promise<RescheduleOutcome> {
  const request = await prisma.interviewRequest.findUnique({
    where: { id: requestId },
    include: { candidate: true, windows: true, panel: { include: { interviewer: true } } }
  });
  if (!request) throw new Error('Request not found');

  const booking = await prisma.booking.findFirst({
    where: { requestId, status: 'CONFIRMED' }
  });

  const adapter = getCalendarAdapter();

  // Branch 1: Same-Time Replacement
  if (booking && declinerId) {
    const allUsers = await prisma.user.findMany({ where: { role: 'INTERVIEWER' } });
    const pool = allUsers.map(u => ({
      id: u.id,
      name: u.name,
      timezone: u.timezone,
      labels: (u.labels ? u.labels.split(',') : []) as RoundType[],
      skills: u.skills ? u.skills.split(',') : [],
      dailyLimit: u.dailyLimit,
      currentLoad: 0,
      availability: [],
      busy: [] 
    }));

    const excludeIds = request.panel.map(p => p.interviewerId);

    const selection = pickPanel({
      roundType: request.roundType as RoundType,
      requiredSkills: request.requiredSkills ? request.requiredSkills.split(',') : [],
      panelSize: 1, 
      window: { start: booking.startUtc.toISOString(), end: booking.endUtc.toISOString() }, 
      durationMin: request.durationMin,
      excludeIds
    }, pool);

    if (!selection.insufficient && selection.selected.length > 0) {
      const replacement = selection.selected[0];
      
      await prisma.$transaction(async (tx) => {
        await tx.panelAssignment.deleteMany({
          where: { requestId, interviewerId: declinerId }
        });
        await tx.panelAssignment.create({
          data: { requestId, interviewerId: replacement.id, status: 'PENDING', reason: 'Same-time replacement' }
        });
        await tx.eventLog.create({
          data: { requestId, actor: 'system', action: 'REPLACED_SAME_TIME', detail: `Replaced with ${replacement.name}` }
        });
      });

      const replacementUser = await prisma.user.findUnique({ where: { id: replacement.id } });
      if (replacementUser) {
         await sendNotification({
           requestId,
           toEmail: replacementUser.email,
           template: 'interviewer-booked',
           subject: 'New Interview',
           body: 'You have been assigned to an interview.'
         });
      }

      return {
        outcome: 'REPLACED_SAME_TIME',
        message: `Successfully replaced interviewer with ${replacement.name} at the exact same time.`,
        newInterviewerName: replacement.name
      };
    }
  }

  // Branch 2: Auto-Rebook
  if (request.windows.length > 0) {
    const participants: EngineParticipant[] = [];
    participants.push({
      id: request.candidate.id,
      name: request.candidate.name,
      role: 'candidate',
      timezone: request.candidate.timezone,
      availability: request.windows.map(w => ({ start: w.startUtc.toISOString(), end: w.endUtc.toISOString() })),
      busy: []
    });

    const currentPanel = declinerId ? request.panel.filter(p => p.interviewerId !== declinerId) : request.panel;

    for (const p of currentPanel) {
      const calId = p.interviewer.calendarId || p.interviewer.email;
      const busy = await adapter.getBusy(calId, request.windowStart, request.windowEnd);
      participants.push({
        id: p.interviewer.id,
        name: p.interviewer.name,
        role: 'interviewer',
        timezone: p.interviewer.timezone,
        availability: [], 
        busy: busy.map(b => ({ start: b.start.toISOString(), end: b.end.toISOString() })),
        dailyLimit: p.interviewer.dailyLimit
      });
    }

    const config: EngineConfig = {
      durationMin: request.durationMin,
      bufferMin: 15,
      workingHoursStart: "09:00",
      workingHoursEnd: "18:00",
      window: { start: request.windowStart.toISOString(), end: request.windowEnd.toISOString() }
    };

    const slotResult = generateSlots(config, participants);
    
    const validNewSlots = slotResult.slots.filter(s => {
       if (!booking) return true;
       return s.start !== booking.startUtc.toISOString() || s.end !== booking.endUtc.toISOString();
    });

    if (validNewSlots.length > 0) {
      const bestSlot = validNewSlots[0];
      
      const newBooking = await prisma.$transaction(async (tx) => {
        if (booking) {
          await tx.booking.update({
            where: { id: booking.id },
            data: { status: 'SUPERSEDED', activeKey: null }
          });
        }

        if (declinerId) {
          await tx.panelAssignment.deleteMany({
            where: { requestId, interviewerId: declinerId }
          });
        }

        const nb = await tx.booking.create({
          data: {
            requestId,
            startUtc: new Date(bestSlot.start),
            endUtc: new Date(bestSlot.end),
            status: 'CONFIRMED',
            activeKey: requestId
          }
        });

        await tx.eventLog.create({
          data: { requestId, actor: 'system', action: 'REBOOKED_NEW_TIME', detail: `Auto-rebooked to ${bestSlot.start}` }
        });

        return nb;
      });

      // Delete old calendar event AFTER transaction commits (external I/O)
      if (booking?.eventId) await adapter.deleteEvent(booking.eventId);

      const attendees = [request.candidate.email, ...currentPanel.map(p => p.interviewer.email)];
      const event = await adapter.createEvent({
        requestId,
        startUtc: new Date(bestSlot.start),
        endUtc: new Date(bestSlot.end),
        attendees,
        summary: `Interview (Rescheduled): ${request.jobTitle}`,
        description: `Interview via SIRA.`
      });

      await prisma.booking.update({
        where: { id: newBooking.id },
        data: { eventId: event.eventId, meetLink: event.meetLink }
      });

      await sendNotification({
        requestId,
        toEmail: request.candidate.email,
        template: 'rescheduled',
        subject: `Interview Rescheduled: ${request.jobTitle}`,
        body: `Your interview has been rescheduled to ${bestSlot.start}. Meet link: ${event.meetLink}`
      });

      return {
        outcome: 'REBOOKED_NEW_TIME',
        message: `Auto-rebooked to a new time based on candidate's original availability.`,
        newStartUtc: bestSlot.start,
        newEndUtc: bestSlot.end
      };
    }
  }

  // Branch 3: Complete Failure -> RESCHEDULE_REQUIRED
  await prisma.$transaction(async (tx) => {
    if (booking) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'SUPERSEDED', activeKey: null }
      });
    }
    
    await tx.interviewRequest.update({
      where: { id: requestId },
      data: { status: 'RESCHEDULE_REQUIRED', blockedReason: 'No alternative slots available.' }
    });

    await tx.eventLog.create({
      data: { requestId, actor: 'system', action: 'RESCHEDULE_REQUIRED', detail: `Could not automatically reschedule.` }
    });
  });

  // Delete old calendar event AFTER transaction commits (external I/O)
  if (booking?.eventId) await adapter.deleteEvent(booking.eventId);

  const baseUrl = process.env.APP_URL || 'http://localhost:3000';
  await sendNotification({
    requestId,
    toEmail: request.candidate.email,
    template: 'reschedule-request',
    subject: `Action Required: Reschedule ${request.jobTitle}`,
    body: `We need to reschedule your interview. Please provide new times: <a href="${baseUrl}/s/${request.token}">${baseUrl}/s/${request.token}</a>`
  });

  return {
    outcome: 'RESCHEDULE_REQUIRED',
    message: 'Could not automatically replace or rebook. Request sent back to candidate for new availability.'
  };
}
