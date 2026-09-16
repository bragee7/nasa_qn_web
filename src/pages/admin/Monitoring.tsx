import { useState, useEffect } from 'react';
import { Shell, SideLink } from '../../components/layout';
import { Card, Empty } from '../../components/ui';
import { repo } from '../../lib/repo';
import { monitoringStatus } from '../../lib/utils';
export default function Monitoring(){
  const [aid,setAid]=useState('');
  const [attempts,setAttempts]=useState<any[]>([]);
  const [students,setStudents]=useState(new Map<string,any>());
  const [timeline,setTimeline]=useState<any[]>([]);
  useEffect(()=>{ (async()=>{
    setAttempts(await repo.all<any>('attempts'));
    setStudents(new Map((await repo.all<any>('students')).map(s=>[s.id,s])));
  })(); },[]);
  useEffect(()=>{ (async()=>{
    if(!aid){ setTimeline([]); return; }
    setTimeline((await repo.all<any>('events')).filter(e=>e.attemptId===aid).sort((x,y)=>x.timestamp-y.timestamp));
  })(); },[aid]);
  const focus=aid?attempts.find(a=>a.id===aid):undefined;
  return <Shell sidebar={<><SideLink to="/admin/monitoring" label="Monitoring" /><SideLink to="/admin/results" label="Results" /><SideLink to="/admin/dashboard" label="Dashboard" /></>}>
    <Card><b>Exam monitoring</b><p className="text-sm text-slate-500">Select an attempt to view its event timeline.</p></Card>
    {attempts.length===0?<Empty title="No attempts yet." />:attempts.slice(0,100).map(a=>{ const s=students.get(a.studentId); const tot=(a.tabSwitchCount||0)+(a.fsExitCount||0)+(a.refreshCount||0)+(a.netDiscCount||0);
      return <Card key={a.id}><button className="text-left w-full" onClick={()=>setAid(a.id)}><b>{s?.studentId} · {s?.name}</b> <span className="text-xs text-slate-500">{a.examId} · Tab {a.tabSwitchCount} · FS-exit {a.fsExitCount} · Refresh {a.refreshCount} · Net {a.netDiscCount} · <b>{monitoringStatus(tot)}</b></span></button></Card>;})}
    {focus&&<Card><b>Timeline — {students.get(focus.studentId)?.studentId}</b>
      <div className="text-xs text-slate-500">Tab switches {focus.tabSwitchCount} · Fullscreen exits {focus.fsExitCount} · Refreshes {focus.refreshCount} · Disconnects {focus.netDiscCount}</div>
      <div className="mt-2 space-y-1 text-sm">{timeline.map(e=><div key={e.id} className="flex gap-3"><span className="font-mono text-slate-500">{new Date(e.timestamp).toLocaleTimeString()}</span><b>{e.eventType}</b></div>)}</div></Card>}
  </Shell>;
}
