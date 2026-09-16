import { useState, useEffect } from 'react';
import { Shell, SideLink } from '../../components/layout';
import { Card, Empty } from '../../components/ui';
import { repo } from '../../lib/repo';
export default function AuditLogs(){
  const [logs,setLogs]=useState<any[]>([]);
  useEffect(()=>{ (async()=>{
    setLogs((await repo.all<any>('auditLogs')).sort((a,b)=>b.timestamp-a.timestamp).slice(0,300));
  })(); },[]);
  return <Shell sidebar={<><SideLink to="/admin/audit-logs" label="Audit Logs" /><SideLink to="/admin/dashboard" label="Dashboard" /></>}>
    <Card><b>Admin audit log</b></Card>
    {logs.length===0?<Empty title="No audit events." />:logs.map(l=><Card key={l.id}><p className="text-sm"><span className="font-mono text-slate-500">{new Date(l.timestamp).toLocaleString()}</span> · <b>{l.action}</b> · {l.adminEmail} · {l.targetType}:{l.targetId}</p></Card>)}
  </Shell>;
}
