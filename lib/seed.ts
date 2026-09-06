import prisma from './db';
import bcrypt from 'bcryptjs';

export async function runSeed() {
  // 1. Calculate next Monday
  const now = new Date();
  const daysUntilMonday = ((1 + 7 - now.getUTCDay()) % 7) || 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday));
  
  // Wipe existing
  await prisma.eventLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.panelAssignment.deleteMany();
  await prisma.availabilityWindow.deleteMany();
  await prisma.interviewRequest.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.calendarBusy.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('demo1234', 10);

  // 2. Staff Users
  const users = await Promise.all([
    prisma.user.create({ data: { email: 'jordan@example.com', name: 'Jordan Lee', role: 'ADMIN', passwordHash, timezone: 'Europe/London' } }),
    prisma.user.create({ data: { email: 'vikram@example.com', name: 'Vikram Rao', role: 'INTERVIEWER', passwordHash, timezone: 'Asia/Kolkata', calendarId: 'vikram_cal', labels: 'MANAGERIAL', dailyLimit: 2 } }),
    prisma.user.create({ data: { email: 'alex@example.com', name: 'Alex Rivera', role: 'INTERVIEWER', passwordHash, timezone: 'America/New_York', calendarId: 'alex_cal', labels: 'TECHNICAL,MANAGERIAL', dailyLimit: 2 } }),
    prisma.user.create({ data: { email: 'priya@example.com', name: 'Priya Sharma', role: 'INTERVIEWER', passwordHash, timezone: 'Asia/Kolkata', calendarId: 'priya_cal', labels: 'TECHNICAL', dailyLimit: 3 } }),
    prisma.user.create({ data: { email: 'rahul@example.com', name: 'Rahul Verma', role: 'INTERVIEWER', passwordHash, timezone: 'Asia/Kolkata', calendarId: 'rahul_cal', labels: 'TECHNICAL', dailyLimit: 3 } }),
    prisma.user.create({ data: { email: 'ananya@example.com', name: 'Ananya Patel', role: 'INTERVIEWER', passwordHash, timezone: 'Asia/Kolkata', calendarId: 'ananya_cal', labels: 'HR,SCREENING', dailyLimit: 3 } }),
    prisma.user.create({ data: { email: 'admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash, timezone: 'Asia/Kolkata' } }),
  ]);
  
  const alex = users[2];
  const priya = users[3];
  const rahul = users[4];

  // Helper to get dates relative to next Monday
  const day = (d: number, h: number = 0, m: number = 0) => {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + d);
    date.setUTCHours(h, m, 0, 0);
    return date;
  };

  // 3. Calendar Busy Blocks
  await prisma.calendarBusy.createMany({
    data: [
      { calendarId: 'priya_cal', title: 'Lunch', startUtc: day(0, 7, 30), endUtc: day(0, 8, 30) }, // Mon 1pm-2pm IST
      { calendarId: 'priya_cal', title: 'Planning', startUtc: day(1, 4, 30), endUtc: day(1, 6, 30) }, // Tue 10am-12pm IST
      { calendarId: 'rahul_cal', title: 'Lunch', startUtc: day(0, 7, 30), endUtc: day(0, 8, 30) }, // Mon 1pm-2pm IST
      { calendarId: 'alex_cal', title: 'Arch Review', startUtc: day(0, 14, 0), endUtc: day(0, 16, 0) }, // Mon 10am-12pm EST
    ]
  });

  // 4. Candidate Scenarios
  const generateToken = () => Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  const scenarios = [];

  // S1 (Dev Menon): AWAITING_AVAILABILITY
  const s1 = await prisma.candidate.create({ data: { name: 'Dev Menon', email: 'dev@example.com', timezone: 'Asia/Kolkata' } });
  const req1 = await prisma.interviewRequest.create({
    data: {
      candidateId: s1.id, jobTitle: 'Frontend Engineer', roundType: 'TECHNICAL', durationMin: 60, requiredSkills: 'React',
      windowStart: day(0), windowEnd: day(5), status: 'AWAITING_AVAILABILITY', token: generateToken(), tokenExpiresAt: day(5)
    }
  });
  scenarios.push({ name: 'S1 (Dev Menon)', scenario: 'AWAITING_AVAILABILITY', token: req1.token });

  // S2 (Maya Iyer): READY_TO_SCHEDULE
  const s2 = await prisma.candidate.create({ data: { name: 'Maya Iyer', email: 'maya@example.com', timezone: 'Asia/Kolkata' } });
  const req2 = await prisma.interviewRequest.create({
    data: {
      candidateId: s2.id, jobTitle: 'Backend Engineer', roundType: 'TECHNICAL', durationMin: 60, requiredSkills: 'Node.js',
      windowStart: day(0), windowEnd: day(2), status: 'READY_TO_SCHEDULE', token: generateToken(), tokenExpiresAt: day(5)
    }
  });
  await prisma.availabilityWindow.createMany({ data: [{ requestId: req2.id, startUtc: day(0, 5, 0), endUtc: day(0, 9, 0) }] });
  scenarios.push({ name: 'S2 (Maya Iyer)', scenario: 'READY_TO_SCHEDULE', token: req2.token });

  // S3 (Carlos Mendes): READY_TO_SCHEDULE (LA timezone)
  const s3 = await prisma.candidate.create({ data: { name: 'Carlos Mendes', email: 'carlos@example.com', timezone: 'America/Los_Angeles' } });
  const req3 = await prisma.interviewRequest.create({
    data: {
      candidateId: s3.id, jobTitle: 'Senior Backend', roundType: 'TECHNICAL', durationMin: 60, requiredSkills: 'Java',
      windowStart: day(0), windowEnd: day(5), status: 'READY_TO_SCHEDULE', token: generateToken(), tokenExpiresAt: day(5)
    }
  });
  await prisma.availabilityWindow.createMany({ data: [{ requestId: req3.id, startUtc: day(0, 16, 0), endUtc: day(0, 20, 0) }] });
  scenarios.push({ name: 'S3 (Carlos Mendes)', scenario: 'LA Timezone', token: req3.token });

  // S4 (Sophia Reddy): SCHEDULED (Priya declines -> Rahul swaps)
  const s4 = await prisma.candidate.create({ data: { name: 'Sophia Reddy', email: 'sophia@example.com', timezone: 'Asia/Kolkata' } });
  const req4 = await prisma.interviewRequest.create({
    data: {
      candidateId: s4.id, jobTitle: 'Frontend Engineer', roundType: 'TECHNICAL', durationMin: 60, requiredSkills: 'React',
      windowStart: day(0), windowEnd: day(5), status: 'SCHEDULED', token: generateToken(), tokenExpiresAt: day(5)
    }
  });
  await prisma.panelAssignment.create({ data: { requestId: req4.id, interviewerId: priya.id, status: 'PENDING' } });
  await prisma.booking.create({ data: { requestId: req4.id, startUtc: day(3, 9, 30), endUtc: day(3, 10, 30), activeKey: req4.id, meetLink: 'https://meet.google.com/mock-s4' } });
  scenarios.push({ name: 'S4 (Sophia Reddy)', scenario: 'Same-time swap test', token: req4.token });

  // S5 (Ethan Blake): READY_TO_SCHEDULE (tight window)
  const s5 = await prisma.candidate.create({ data: { name: 'Ethan Blake', email: 'ethan@example.com', timezone: 'Europe/London' } });
  const req5 = await prisma.interviewRequest.create({
    data: {
      candidateId: s5.id, jobTitle: 'Product Designer', roundType: 'HR', durationMin: 45, requiredSkills: 'Design',
      windowStart: day(0), windowEnd: day(5), status: 'READY_TO_SCHEDULE', token: generateToken(), tokenExpiresAt: day(5)
    }
  });
  await prisma.availabilityWindow.createMany({ data: [{ requestId: req5.id, startUtc: day(1, 10, 0), endUtc: day(1, 11, 0) }] });
  scenarios.push({ name: 'S5 (Ethan Blake)', scenario: 'Tight Window', token: req5.token });

  // S6 (Chloe Fernandes): SCHEDULED (Cancellation test)
  const s6 = await prisma.candidate.create({ data: { name: 'Chloe Fernandes', email: 'chloe@example.com', timezone: 'Asia/Kolkata' } });
  const req6 = await prisma.interviewRequest.create({
    data: {
      candidateId: s6.id, jobTitle: 'Engineering Manager', roundType: 'MANAGERIAL', durationMin: 60, requiredSkills: 'Leadership',
      windowStart: day(0), windowEnd: day(5), status: 'SCHEDULED', token: generateToken(), tokenExpiresAt: day(5)
    }
  });
  await prisma.panelAssignment.create({ data: { requestId: req6.id, interviewerId: alex.id, status: 'ACCEPTED' } });
  await prisma.booking.create({ data: { requestId: req6.id, startUtc: day(2, 5, 30), endUtc: day(2, 6, 30), activeKey: req6.id, meetLink: 'https://meet.google.com/mock-s6' } });
  scenarios.push({ name: 'S6 (Chloe Fernandes)', scenario: 'Cancellation Demo', token: req6.token });

  // S7 (Ryan Cole): SCHEDULED (Reschedule fail -> RESCHEDULE_REQUIRED)
  const s7 = await prisma.candidate.create({ data: { name: 'Ryan Cole', email: 'ryan@example.com', timezone: 'America/New_York' } });
  const req7 = await prisma.interviewRequest.create({
    data: {
      candidateId: s7.id, jobTitle: 'Backend Engineer', roundType: 'TECHNICAL', durationMin: 60, requiredSkills: 'Java',
      windowStart: day(0), windowEnd: day(5), status: 'SCHEDULED', token: generateToken(), tokenExpiresAt: day(5)
    }
  });
  await prisma.panelAssignment.create({ data: { requestId: req7.id, interviewerId: rahul.id, status: 'DECLINED' } });
  await prisma.availabilityWindow.createMany({ data: [{ requestId: req7.id, startUtc: day(4, 14, 0), endUtc: day(4, 15, 0) }] });
  await prisma.booking.create({ data: { requestId: req7.id, startUtc: day(4, 14, 0), endUtc: day(4, 15, 0), activeKey: req7.id, meetLink: 'https://meet.google.com/mock-s7' } });
  scenarios.push({ name: 'S7 (Ryan Cole)', scenario: 'Reschedule Failure', token: req7.token });

  // S8 (Nikhil Rao): SCHEDULED (Auto-rebooked test)
  const s8 = await prisma.candidate.create({ data: { name: 'Nikhil Rao', email: 'nikhil@example.com', timezone: 'Asia/Kolkata' } });
  const req8 = await prisma.interviewRequest.create({
    data: {
      candidateId: s8.id, jobTitle: 'Frontend Engineer', roundType: 'TECHNICAL', durationMin: 60, requiredSkills: 'React',
      windowStart: day(0), windowEnd: day(5), status: 'SCHEDULED', token: generateToken(), tokenExpiresAt: day(5)
    }
  });
  await prisma.panelAssignment.create({ data: { requestId: req8.id, interviewerId: priya.id, status: 'PENDING' } });
  await prisma.availabilityWindow.createMany({ data: [
    { requestId: req8.id, startUtc: day(4, 4, 30), endUtc: day(4, 5, 30) },
    { requestId: req8.id, startUtc: day(4, 8, 30), endUtc: day(4, 9, 30) } 
  ]});
  await prisma.booking.create({ data: { requestId: req8.id, startUtc: day(4, 4, 30), endUtc: day(4, 5, 30), activeKey: req8.id, meetLink: 'https://meet.google.com/mock-s8' } });
  scenarios.push({ name: 'S8 (Nikhil Rao)', scenario: 'Auto-rebooked Test', token: req8.token });

  const logins = users.map(u => ({ email: u.email, role: u.role, password: 'demo1234' }));
  const candidateLinks = scenarios.map(s => ({
    name: s.name,
    scenario: s.scenario,
    url: `/s/${s.token}`
  }));

  return {
    ok: true,
    counts: {
      users: users.length,
      candidates: 8,
      requests: 8
    },
    candidateLinks,
    logins
  };
}
