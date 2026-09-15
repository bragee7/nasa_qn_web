import { useState } from 'react';
import { Shell, SideLink } from '../../components/layout';
import { Card } from '../../components/ui';
import { APP } from '../../config/app';
import { DEFAULT_LIMITS_MB, getAIProvider, getImportLimitsMB, setAIProvider, setImportLimitsMB, type AIProviderId } from '../../services/aiImport/config';
export default function Settings(){
  const [lim,setLim]=useState(getImportLimitsMB());
  const [prov,setProv]=useState<AIProviderId>(getAIProvider());
  const [saved,setSaved]=useState('');
  function saveImport(){
    const clean={ pdf:Number(lim.pdf)>0?Number(lim.pdf):DEFAULT_LIMITS_MB.pdf, excel:Number(lim.excel)>0?Number(lim.excel):DEFAULT_LIMITS_MB.excel, csv:Number(lim.csv)>0?Number(lim.csv):DEFAULT_LIMITS_MB.csv };
    setImportLimitsMB(clean); setLim(clean); setAIProvider(prov); setSaved('Import settings saved.');
  }
  return <Shell sidebar={<><SideLink to="/admin/settings" label="Settings" /><SideLink to="/admin/dashboard" label="Dashboard" /></>}>
    <Card><b>Platform settings</b>
      <p className="text-sm mt-2">App: {APP.name} — {APP.subtitle}</p>
      <p className="text-sm">Timezone: {APP.timezone} (stored UTC, displayed {APP.timezone})</p>
      <p className="text-sm">Monitoring thresholds: 0–{APP.monitoring.normalMax} NORMAL · {APP.monitoring.normalMax+1}–{APP.monitoring.attentionMax} ATTENTION · {APP.monitoring.attentionMax+1}+ REVIEW</p>
      <p className="text-sm">Default pass: {APP.passPctDefault}%</p>
      <p className="text-xs text-slate-500 mt-2">Change centrally in src/config/app.ts. Rename brand in one place.</p></Card>
    <Card><b>Question import — file limits & AI provider</b>
      <p className="text-xs text-slate-500 mt-1">Defaults: PDF {DEFAULT_LIMITS_MB.pdf} MB · Excel/Word {DEFAULT_LIMITS_MB.excel} MB · CSV {DEFAULT_LIMITS_MB.csv} MB. Uploads above the limit are rejected with a friendly message.</p>
      <div className="grid sm:grid-cols-4 gap-2 mt-2">
        <label className="text-xs">PDF max (MB)<input type="number" min={1} className="input" value={lim.pdf} onChange={e=>setLim({...lim,pdf:Number(e.target.value)})} /></label>
        <label className="text-xs">Excel/Word max (MB)<input type="number" min={1} className="input" value={lim.excel} onChange={e=>setLim({...lim,excel:Number(e.target.value)})} /></label>
        <label className="text-xs">CSV max (MB)<input type="number" min={1} className="input" value={lim.csv} onChange={e=>setLim({...lim,csv:Number(e.target.value)})} /></label>
        <label className="text-xs">AI provider<select className="input" value={prov} onChange={e=>setProv(e.target.value as AIProviderId)}>
          <option value="local">local — offline heuristics (default, free)</option>
          <option value="gemini">gemini — via secure backend</option>
          <option value="openai">openai — via secure backend</option>
          <option value="ollama">ollama — self-hosted backend</option>
        </select></label>
      </div>
      <p className="text-xs text-slate-500 mt-1">Cloud providers call the <code>analyzeImport</code> Cloud Function, which holds the API key server-side. The browser never sees provider keys. Until a backend is configured, cloud choices fail closed with guidance.</p>
      <button className="btn-primary mt-2" onClick={saveImport}>Save import settings</button>
      {saved&&<p className="text-xs text-emerald-700 mt-1">{saved}</p>}</Card>
  </Shell>;
}
