import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell, SideLink } from '../../components/layout';
import { Card, Empty } from '../../components/ui';
import { db } from '../../lib/store';
import { DEPT_OPTIONS, fmtDateTime } from '../../lib/utils';
import { useSession } from '../../services/auth';
import { allBanks, archiveBank, createBank, deleteBank, duplicateBank, getBank, recomputeCount, type BankInput } from '../../services/banks';
import type { QuestionBank } from '../../types/models';

export default function QuestionBanks() {
  const { session } = useSession();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [sort, setSort] = useState('recent');
  const [list, setList] = useState<QuestionBank[]>(() => allBanks());
  const [form, setForm] = useState<BankInput & { name: string }>({ name: '', description: '', subject: 'General', year: 'all', department: [], section: 'all' });
  const refresh = () => setList(allBanks());
  function audit(action: string, id: string, meta: Record<string, any> = {}) {
    const l = db.all<any>('auditLogs');
    l.push({ id: crypto.randomUUID(), adminId: session!.uid, adminEmail: session!.email, action, targetType: 'questionBank', targetId: id, timestamp: Date.now(), metadata: meta });
    localStorage.setItem('examora_auditLogs', JSON.stringify(l));
  }
  const nameTaken = form.name.trim() !== '' && list.some(b => b.name.toLowerCase() === form.name.trim().toLowerCase());
  function save() {
    if (!form.name.trim()) return alert('Bank name is required.');
    const b = createBank(form, session!.uid);
    audit('QUESTION_BANK_CREATED', b.id, { name: b.name });
    setForm({ name: '', description: '', subject: 'General', year: 'all', department: [], section: 'all' });
    refresh();
  }
  function dup(id: string) {
    const src = getBank(id); if (!src) return;
    const copy = duplicateBank(src, session!.uid);
    audit('QUESTION_BANK_DUPLICATED', copy.id, { from: id, name: copy.name });
    refresh();
  }
  function toggleArchive(id: string) {    const b = getBank(id); if (!b) return;
    if (b.status === 'ACTIVE') archiveBank(id);
    else db.put('questionBanks', { ...b, status: 'ACTIVE' as const, updatedAt: Date.now() });
    audit(b.status === 'ACTIVE' ? 'QUESTION_BANK_ARCHIVED' : 'QUESTION_BANK_UPDATED', id, { status: b.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' });
    refresh();
  }
  function del(id: string) {
    const b = getBank(id); if (!b) return;
    if (!confirm(`Delete bank “${b.name}”? Its ${b.questionCount} question(s) are KEPT (moved to No bank). This cannot be undone.`)) return;
    const r = deleteBank(id);
    if (!r.ok) { alert(r.reason); return; }
    audit('QUESTION_BANK_DELETED', id, { name: b.name, unassigned: r.unassigned });
    refresh();
  }
  const filtered = list
    .filter(b => (status === 'All' || b.status === status) && (q === '' || (b.name + ' ' + b.subject + ' ' + b.description).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'count' ? b.questionCount - a.questionCount : b.updatedAt - a.updatedAt);
  const toggleDept = (d: string) => setForm(f => ({ ...f, department: f.department!.includes(d) ? f.department!.filter(x => x !== d) : [...f.department!, d] }));
  return <Shell sidebar={<><SideLink to="/admin/question-banks" label="Question Banks" /><SideLink to="/admin/questions" label="All Questions" /><SideLink to="/admin/exams" label="Exams" /><SideLink to="/admin/dashboard" label="Dashboard" /></>}>
    <Card><div className="flex flex-wrap gap-2 items-center">
      <b className="mr-auto">Question banks</b>
      <input className="input !w-52" placeholder="Search banks..." value={q} onChange={e => setQ(e.target.value)} />
      <select className="input !w-32" value={status} onChange={e => setStatus(e.target.value)}><option>All</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select>
      <select className="input !w-44" value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Recently updated</option><option value="name">Name A–Z</option><option value="count">Most questions</option></select>
    </div></Card>
    <Card><b>Create bank</b>
      <div className="grid sm:grid-cols-2 gap-2 mt-2">
        <input className="input sm:col-span-2" placeholder="Bank name (required, e.g. DBMS Mid-Term Bank)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        {nameTaken && <p className="text-xs text-amber-600 sm:col-span-2">⚠ A bank with this name already exists — names should be unique.</p>}
        <input className="input sm:col-span-2" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <input className="input" placeholder="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
        <input className="input" placeholder="Section (or 'all')" value={form.section} onChange={e => setForm({ ...form, section: e.target.value })} />
        <label className="text-xs text-slate-500 flex items-center gap-2">Year
          <select className="input !w-28" value={String(form.year)} onChange={e => setForm({ ...form, year: e.target.value === 'all' ? 'all' : Number(e.target.value) })}><option value="all">all</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select>
        </label>
        <div className="text-xs text-slate-600">Departments (none = all):<div className="flex flex-wrap gap-2 mt-1">{DEPT_OPTIONS.map(d => <label key={d} className="inline-flex items-center gap-1"><input type="checkbox" checked={form.department!.includes(d)} onChange={() => toggleDept(d)} />{d}</label>)}</div></div>
      </div>
      <button className="btn-primary mt-3" onClick={save}>Create bank</button>
    </Card>
    {filtered.length === 0 ? <Empty title="No banks found." /> : <div className="grid sm:grid-cols-2 gap-4">{filtered.map(b => <Card key={b.id}>
      <div className="flex items-start gap-2">
        <div className="mr-auto min-w-0">
          <Link to={`/admin/question-banks/${b.id}`} className="font-bold text-indigo-700 hover:underline">{b.name}</Link>
          <span className={`ml-2 px-1.5 rounded text-xs ${b.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{b.status}</span>
          <p className="text-xs text-slate-500 mt-1">{b.questionCount} questions · {b.subject}{b.year !== 'all' && ` · Year ${b.year}`}{(b.department?.length ?? 0) > 0 && ` · ${b.department.join(', ')}`} · Sec {b.section}</p>
          {b.description && <p className="text-sm text-slate-600 mt-1">{b.description}</p>}
          <p className="text-xs text-slate-400 mt-1">Updated {fmtDateTime(b.updatedAt)} IST</p>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Link className="btn-primary !text-xs text-center" to={`/admin/question-banks/${b.id}`}>Open</Link>
          <button className="btn-ghost !text-xs" onClick={() => dup(b.id)}>Duplicate</button>
          <button className="btn-ghost !text-xs" onClick={() => { toggleArchive(b.id); }} title={b.status === 'ACTIVE' ? 'Archive (banks in use are kept, not deleted)' : 'Restore'}>{b.status === 'ACTIVE' ? 'Archive' : 'Restore'}</button>
          <button className="btn-ghost !text-xs !text-red-600" onClick={() => del(b.id)} title="Delete bank (blocked while exams use it; questions are kept)">Delete</button>
        </div>
      </div>
    </Card>)}</div>}
  </Shell>;
}