// Two different candidates, same pool, same time → exactly one must win.
const BASE = 'http://localhost:3000';
let cookie = '';

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(opts.headers || {}) },
  });
  const setC = res.headers.get('set-cookie');
  if (setC) cookie = setC.split(';')[0];
  return { status: res.status, json: await res.json() };
}

await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'jordan@example.com', password: 'demo1234' }) });

const mon = new Date(); mon.setUTCHours(0,0,0,0);
mon.setUTCDate(mon.getUTCDate() + (((8 - mon.getUTCDay()) % 7) || 7));
const dayISO = (d) => new Date(mon.getTime() + d * 86400000).toISOString();

const made = [];
for (const who of ['Race One', 'Race Two']) {
  const r = await api('/api/requests', { method: 'POST', body: JSON.stringify({
    newCandidate: { name: who, email: `${who.replace(' ','').toLowerCase()}@example.com`, timezone: 'Asia/Kolkata' },
    jobTitle: 'Backend Engineer', roundType: 'TECHNICAL', durationMin: 60,
    requiredSkills: ['Java','Backend'], panelSize: 1,
    window: { start: dayISO(0), end: dayISO(2) }, sendAvailabilityRequest: false,
  })});
  if (!r.json.ok) { console.log('create failed:', r.json); process.exit(1); }
  made.push(r.json.data);
}

// Give both the same availability window so they compete for the same times.
for (const req of made) {
  const av = await api(`/api/public/${req.candidateLink.split('/s/')[1]}/availability`, {
    method: 'POST',
    // Mon 14:00-18:00 IST = 08:30-12:30 UTC — inside IST working hours.
    body: JSON.stringify({ windows: [{ start: new Date(mon.getTime() + 8.5*3600000).toISOString(),
                                       end:   new Date(mon.getTime() + 12.5*3600000).toISOString() }] }),
  });
  if (!av.json.ok) console.log('availability FAILED:', av.json);
}

const slotsFor = async (id) => (await api(`/api/requests/${id}/slots`)).json.data;
const a = await slotsFor(made[0].id);
const b = await slotsFor(made[1].id);
console.log('A slots:', a.slots.length, '| B slots:', b.slots.length);

const shared = a.slots.find(x => b.slots.some(y =>
  y.start === x.start && y.interviewerIds.some(i => x.interviewerIds.includes(i))));
if (!shared) { console.log('no shared slot to race on'); process.exit(0); }
console.log('racing on', shared.start, 'with', shared.interviewerNames);

const body = JSON.stringify({ startUtc: shared.start, endUtc: shared.end });
const [r1, r2] = await Promise.all([
  api(`/api/requests/${made[0].id}/book`, { method: 'POST', body }),
  api(`/api/requests/${made[1].id}/book`, { method: 'POST', body }),
]);
console.log('result 1:', r1.status, r1.json.ok ? 'BOOKED' : r1.json.error.code);
console.log('result 2:', r2.status, r2.json.ok ? 'BOOKED' : r2.json.error.code);
const wins = [r1, r2].filter(r => r.json.ok).length;
console.log(wins === 1 ? 'PASS — exactly one booking won' : `FAIL — ${wins} bookings succeeded`);
