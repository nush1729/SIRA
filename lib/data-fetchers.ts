import prisma from './db';
import { RequestDetailDTO, RoundType } from './contracts';

export async function fetchRequestDetail(id: string): Promise<RequestDetailDTO | null> {
  const r = await prisma.interviewRequest.findUnique({
    where: { id },
    include: {
      candidate: true,
      windows: true,
      panel: { include: { interviewer: true } },
      bookings: { where: { status: 'CONFIRMED' }, take: 1 },
      notifications: { orderBy: { createdAt: 'desc' } }
    }
  });

  if (!r) return null;

  // Compute real interviewer load for today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);

  const panelWithLoad = await Promise.all(r.panel.map(async (p) => {
    const todayBookings = await prisma.booking.count({
      where: {
        status: 'CONFIRMED',
        startUtc: { gte: todayStart, lte: todayEnd },
        request: { panel: { some: { interviewerId: p.interviewerId } } }
      }
    });
    return {
      assignmentId: p.id,
      interviewerId: p.interviewerId,
      name: p.interviewer.name,
      labels: (p.interviewer.labels ? p.interviewer.labels.split(',') : []) as RoundType[],
      skills: p.interviewer.skills ? p.interviewer.skills.split(',') : [],
      load: `${todayBookings}/${p.interviewer.dailyLimit}`,
      status: p.status as any,
      reason: p.reason
    };
  }));

  return {
    id: r.id,
    candidate: {
      id: r.candidate.id,
      name: r.candidate.name,
      email: r.candidate.email,
      timezone: r.candidate.timezone,
    },
    jobTitle: r.jobTitle,
    roundType: r.roundType as RoundType,
    durationMin: r.durationMin,
    status: r.status as any,
    blockedReason: r.blockedReason,
    requiredSkills: r.requiredSkills ? r.requiredSkills.split(',') : [],
    panelSize: r.panelSize,
    window: {
      start: r.windowStart.toISOString(),
      end: r.windowEnd.toISOString(),
    },
    candidateWindows: r.windows.map(w => ({
      start: w.startUtc.toISOString(),
      end: w.endUtc.toISOString(),
    })),
    panel: panelWithLoad,
    notifications: r.notifications.map(n => ({
      id: n.id,
      toEmail: n.toEmail,
      subject: n.subject,
      template: n.template,
      status: n.status,
      createdAt: n.createdAt.toISOString()
    })),
    booking: r.bookings[0] ? {
      id: r.bookings[0].id,
      startUtc: r.bookings[0].startUtc.toISOString(),
      endUtc: r.bookings[0].endUtc.toISOString(),
      status: r.bookings[0].status as any,
      meetLink: r.bookings[0].meetLink
    } : null,
    candidateLink: `/s/${r.token}`
  };
}
