import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:3000';

async function fetchApi(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, data };
}

async function run() {
  console.log("--- 1. Seed Reset ---");
  const seedRes = await fetchApi('/api/dev/seed', { method: 'POST' });
  if (!seedRes.data?.ok) throw new Error("Seed failed");
  console.log("✅ Database seeded.");
  
  const { logins, candidateLinks } = seedRes.data;
  const recruiter = logins.find((l: any) => l.role === 'RECRUITER');
  const interviewer = logins.find((l: any) => l.email === 'alex@example.com');
  const mayaLink = candidateLinks.find((l: any) => l.name.includes("Maya")); // S2 READY_TO_SCHEDULE
  const sophiaLink = candidateLinks.find((l: any) => l.name.includes("Sophia")); // S4 Same-time swap
  const ryanLink = candidateLinks.find((l: any) => l.name.includes("Ryan")); // S7 Reschedule Failure
  const ethanLink = candidateLinks.find((l: any) => l.name.includes("Ethan")); // S5 Tight Window

  console.log("--- 2. Authenticate as Recruiter ---");
  const recLogin = await fetchApi('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: recruiter.email, password: recruiter.password })
  });
  const recCookie = recLogin.headers.get('set-cookie');
  if (!recCookie) throw new Error("Recruiter login failed");
  console.log("✅ Recruiter authenticated.");

  console.log("--- 3. Test RBAC: Alex (Interviewer) ---");
  const alexLogin = await fetchApi('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: interviewer.email, password: interviewer.password })
  });
  const alexCookie = alexLogin.headers.get('set-cookie');
  
  const rbacTest = await fetchApi('/api/requests', {
    headers: { 'Cookie': alexCookie! }
  });
  if (rbacTest.status !== 403) throw new Error(`RBAC test failed, got ${rbacTest.status}`);
  console.log("✅ RBAC Test Passed (403 for Interviewer).");

  console.log("--- 4. Preview Panel ---");
  const preview = await fetchApi('/api/requests/preview-panel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': recCookie },
    body: JSON.stringify({
      roundType: "TECHNICAL",
      requiredSkills: ["React"],
      panelSize: 1,
      window: { start: new Date().toISOString(), end: new Date(Date.now() + 86400000).toISOString() },
      durationMin: 60
    })
  });
  if (!preview.data?.ok) throw new Error("Preview panel failed");
  console.log("✅ Preview panel succeeded.");

  console.log("--- 5. Candidate public endpoints ---");
  const mayaToken = mayaLink.url.split('/s/')[1];
  const mayaPublic = await fetchApi(`/api/public/${mayaToken}`);
  if (!mayaPublic.data?.ok) throw new Error("Maya public endpoint failed");
  console.log("✅ Candidate public endpoint ok.");

  const invalidToken = await fetchApi('/api/public/invalid123');
  if (invalidToken.status !== 401) throw new Error("Invalid token should be 401");
  console.log("✅ Invalid token rejected.");

  console.log("--- 6. Generate slots and Book Maya (S2) ---");
  const mayaSlots = await fetchApi(`/api/public/${mayaToken}/slots`);
  if (!mayaSlots.data?.ok || mayaSlots.data.data.slots.length === 0) throw new Error("Maya slots failed");
  
  const firstSlot = mayaSlots.data.data.slots[0];
  const mayaBook = await fetchApi(`/api/public/${mayaToken}/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startUtc: firstSlot.start, endUtc: firstSlot.end })
  });
  if (!mayaBook.data?.ok) throw new Error(`Maya book failed: ${JSON.stringify(mayaBook.data)}`);
  console.log("✅ Booked Maya slot. Meet link:", mayaBook.data.data.meetLink);

  console.log("--- 7. Concurrency Test ---");
  const eToken = ethanLink.url.split('/s/')[1];
  const eSlots = await fetchApi(`/api/public/${eToken}/slots`);
  if (!eSlots.data?.ok || eSlots.data.data.slots.length === 0) throw new Error("Ethan slots failed");
  const eSlot = eSlots.data.data.slots[0];

  const p1 = fetchApi(`/api/public/${eToken}/book`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startUtc: eSlot.start, endUtc: eSlot.end })
  });
  const p2 = fetchApi(`/api/public/${eToken}/book`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startUtc: eSlot.start, endUtc: eSlot.end })
  });
  const results = await Promise.all([p1, p2]);
  const s200 = results.filter(r => r.status === 200).length;
  const s409 = results.filter(r => r.status === 409).length;
  if (s200 === 1 && s409 === 1) {
    console.log("✅ Concurrency test passed: Exactly one 200, one 409.");
  } else {
    throw new Error(`Concurrency test failed. Got ${s200}x200 and ${s409}x409`);
  }

  console.log("🎉 All API smoke tests passed! 100% green output with USE_ENGINE_STUB=true.");
}

run().catch(err => {
  console.error("❌ Smoke test failed:", err.message);
  process.exit(1);
});
