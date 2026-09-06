const BASE='http://localhost:3000'; let cookie='';
async function api(p,o={}){const r=await fetch(BASE+p,{...o,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...(o.headers||{})}});
  const c=r.headers.get('set-cookie'); if(c) cookie=c.split(';')[0]; return r.json();}
await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:'jordan@example.com',password:'demo1234'})});
const rows=(await api('/api/requests')).data;
for(const name of ['Dev Menon','Maya Iyer','Carlos Mendes','Ethan Blake','Sophia Reddy','Ryan Cole','Nikhil Rao','Chloe Fernandes']){
  const r=rows.find(x=>x.candidate.name===name); if(!r) continue;
  const det=(await api(`/api/requests/${r.id}`)).data;
  const tok=det.candidateLink.split('/s/')[1];
  if(r.status==='AWAITING_AVAILABILITY'){
    const fd=(await api(`/api/public/${tok}/feasible-days`)).data;
    console.log(`${name.padEnd(17)} ${r.status.padEnd(22)} feasible days: ${fd.days.length} ${JSON.stringify(fd.days)}`);
  } else {
    const s=(await api(`/api/requests/${r.id}/slots`)).data;
    const who=s.slots[0]?.interviewerNames ?? [];
    console.log(`${name.padEnd(17)} ${r.status.padEnd(22)} slots: ${String(s.slots.length).padStart(2)}  first -> ${JSON.stringify(who)}`);
  }
}
