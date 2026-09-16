import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Shell, SideLink } from '../../components/layout';
import { Card, Empty } from '../../components/ui';
import { fmtDateTime, uid } from '../../lib/utils';
import { repo } from '../../lib/repo';
import { audit } from '../../lib/audit';
import { useSession } from '../../services/auth';
import { bankQuestions, deleteBank, deleteQuestions, getBank, recomputeCount } from '../../services/banks';
import type { QuestionBank, Question } from '../../types/models';

const LETTERS = 'ABCDE';
export default function BankDetail() {
  const { bankId } = useParams();
  const nav = useNavigate();
  const { session } = useSession();
  const [bank, setBank] = useState<QuestionBank|undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [list, setList] = useState<Question[]>([]);
  const [q, setQ] = useState('');
  const [addIds, setAddIds] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const refresh = async () => { setBank(await getBank(bankId!)); setList(await bankQuestions(bankId!)); };
  useEffect(()=>{ (async()=>{ await refresh(); setLoaded(true); })(); },[bankId]);
  if (loaded && !bank) return <Shell sidebar={<SideLink to="/admin/question-banks" label="Question Banks" />}><Card><b>Bank not found.</b><p className="text-sm mt-2"><Link className="text-indigo-700 underline" to="/admin/question-banks">Back to banks</Link></p></Card></Shell>;
  if (!bank) return <Shell sidebar={<SideLink to="/admin/question-banks" label="Question Banks" />}><Card><b>Loading…</b></Card></Shell>;
  async function saveMeta(patch: Partial<{ name: string; description: string; subject: string; section: string }>) {
    if (patch.name !== undefined && !patch.name.trim()) return alert('Bank name is required.');
    await repo.put('questionBanks', { ...bank!, ...patch, updatedAt: Date.now() });
    await audit('QUESTION_BANK_UPDATED', bank!.id, patch,'questionBank');
    refresh();
  }
  async function move(x: any, dir: -1 | 1) {
    const sorted = [...list];
    const i = sorted.findIndex(y => y.id === x.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[i], b = sorted[j];
    const ao = a.sourceOrder ?? i + 1, bo = b.sourceOrder ?? j + 1;
    await repo.put('questionBank', { ...a, sourceOrder: bo, updatedAt: Date.now() });
    await repo.put('questionBank', { ...b, sourceOrder: ao, updatedAt: Date.now() });
    refresh();
  }
  async function removeQ(x: any) {
    if (!confirm(`Remove "${x.text.slice(0, 60)}…" from this bank? The question row is kept (unassigned).`)) return;
    await repo.put('questionBank', { ...x, questionBankId: undefined, updatedAt: Date.now() });
    await recomputeCount(bank!.id);
    await audit('QUESTION_REMOVED_FROM_BANK', x.id, { bankId: bank!.id },'questionBank');
    refresh();
  }
  function toggleSel(id: string) {
    setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function bulkDel(ids: string[]) {
    if (!ids.length) return;
    if (!confirm(`Permanently delete ${ids.length} selected question(s)? This cannot be undone.`)) return;
    const r = await deleteQuestions(ids);
    for (const id of ids) await audit('QUESTION_DELETED', id, { bankId: bank!.id, bulk: true },'question');
    setSel(new Set());
    refresh();
    alert(`Deleted ${r.deleted} question(s).`);
  }
  async function addExisting() {
    const ids = addIds.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    if (!ids.length) return;
    let n = 0;
    for (const id of ids) {
      const ex = await repo.get<any>('questionBank', id);
      if (ex && ex.questionBankId !== bank!.id) { await repo.put('questionBank', { ...ex, questionBankId: bank!.id, updatedAt: Date.now() }); n++; }
    }
    await recomputeCount(bank!.id);
    await audit('QUESTION_ADDED_TO_BANK', bank!.id, { count: n },'questionBank');
    setAddIds('');
    refresh();
  }
  async function quickCreate() {
    const text = prompt('New question text:');
    if (!text || text.length < 5) return;
    await repo.put('questionBank', { id: uid('q'), text, type: 'MCQ_SINGLE', subject: bank!.subject, topic: 'General', difficulty: 'Medium', options: ['Option A', 'Option B', 'Option C', 'Option D'], correctAnswer: null, needsAnswer: true, questionBankId: bank!.id, marks: 2, status: 'active', createdBy: session!.uid, createdAt: Date.now(), updatedAt: Date.now() });
    await recomputeCount(bank!.id);
    await audit('QUESTION_ADDED_TO_BANK', bank!.id, { inline: true },'questionBank');
    refresh();
  }
  async function delBank() {
    if (!confirm(`Delete bank “${bank!.name}”? Its ${list.length} question(s) are KEPT (moved to No bank). This cannot be undone.`)) return;
    const r = await deleteBank(bank!.id);
    if (!r.ok) { alert(r.reason); return; }
    await audit('QUESTION_BANK_DELETED', bank!.id, { name: bank!.name, unassigned: r.unassigned },'questionBank');
    nav('/admin/question-banks');
  }
  const filtered = list.filter(x => q === '' || x.text.toLowerCase().includes(q.toLowerCase()));
  return <Shell sidebar={<><SideLink to="/admin/question-banks" label="Question Banks" /><SideLink to="/admin/questions" label="All Questions" /><SideLink to={`/admin/questions/import?bank=${bank!.id}`} label="Import Into Bank" /><SideLink to="/admin/exams" label="Exams" /></>}>
    <Card><div className="flex flex-wrap gap-2 items-center">
      <div className="mr-auto">
        <b>{bank.name}</b>
        <span className={`ml-2 px-1.5 rounded text-xs ${bank.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{bank.status}</span>
        <p className="text-xs text-slate-500">{bank.questionCount} questions · {bank.subject} · Updated {fmtDateTime(bank.updatedAt)} IST</p>
      </div>
      <button className="btn-ghost !text-xs" onClick={() => nav('/admin/question-banks')}>← All banks</button>
    </div></Card>
    <Card><b>Edit details</b><div className="grid sm:grid-cols-2 gap-2 mt-2">
      <input className="input" defaultValue={bank.name} id="bank-name" placeholder="Bank name (required)" />
      <input className="input" defaultValue={bank.subject} id="bank-subject" placeholder="Subject" />
      <input className="input sm:col-span-2" defaultValue={bank.description} id="bank-desc" placeholder="Description" />
      <input className="input" defaultValue={bank.section} id="bank-section" placeholder="Section" />
    </div><button className="btn-primary mt-3" onClick={() => {
      const g = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
      saveMeta({ name: g('bank-name'), subject: g('bank-subject'), description: g('bank-desc'), section: g('bank-section') });
    }}>Save details</button></Card>
    <Card><b>Add questions</b><div className="flex flex-wrap gap-2 mt-2">
      <button className="btn-primary !text-xs" onClick={quickCreate}>+ Quick add</button>
      <Link className="btn-primary !text-xs" to={`/admin/questions/import?bank=${bank.id}`}>⬆ Import file into bank</Link>
      <input className="input !w-64" placeholder="Add existing IDs (comma/space separated)" value={addIds} onChange={e => setAddIds(e.target.value)} />
      <button className="btn-ghost !text-xs" onClick={addExisting}>Add by ID</button>
    </div></Card>
    <Card><div className="flex gap-2 items-center flex-wrap"><b className="mr-auto">Questions ({filtered.length}) — file order</b>
      <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={filtered.length > 0 && filtered.every(x => sel.has(x.id))} onChange={e => setSel(e.target.checked ? new Set(filtered.map(x => x.id)) : new Set())} /> Select all</label>
      <input className="input !w-52" placeholder="Search in bank..." value={q} onChange={e => setQ(e.target.value)} /></div>
      {sel.size > 0 && <div className="flex gap-2 items-center mt-2"><span className="text-xs">{sel.size} selected</span>
        <button className="btn-ghost !text-xs !text-red-600" onClick={() => bulkDel(filtered.filter(x => sel.has(x.id)).map(x => x.id))}>Delete selected</button>
        <button className="btn-ghost !text-xs" onClick={() => setSel(new Set())}>Clear</button></div>}</Card>
    {filtered.length === 0 ? <Empty title="No questions in this bank yet." /> : filtered.map((x, i) => <Card key={x.id}>
      <div className="flex gap-2 items-start"><input type="checkbox" className="mt-1" checked={sel.has(x.id)} onChange={() => toggleSel(x.id)} /><div className="mr-auto min-w-0">
        <p className="text-sm whitespace-pre-wrap"><b className="mr-1">Q{i + 1}</b>
          {x.correctAnswer == null && <span className="mr-1 px-1 rounded bg-violet-100 text-violet-700 text-xs">⏳ Answer pending</span>}
          {x.text}</p>
        {x.type !== 'SHORT_ANSWER' && <ul className="text-sm mt-1 space-y-0.5">{(x.options || []).map((o: string, oi: number) => {
          const ok = x.type === 'TRUE_FALSE' ? x.correctAnswer === (oi === 0) : Array.isArray(x.correctAnswer) ? x.correctAnswer.includes(oi) : x.correctAnswer === oi;
          return <li key={oi} className={ok ? 'font-bold text-emerald-700' : ''}><span className="inline-block w-5">{LETTERS[oi]}.</span> {o} {ok ? '✓' : ''}</li>;
        })}</ul>}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <div className="flex gap-1"><button className="btn-ghost !text-xs" disabled={i === 0} onClick={() => move(x, -1)}>↑</button><button className="btn-ghost !text-xs" disabled={i === filtered.length - 1} onClick={() => move(x, 1)}>↓</button></div>
        <button className="btn-ghost !text-xs" onClick={() => removeQ(x)}>Remove</button>
      </div></div>
    </Card>)}
    <Card><b className="text-red-700">Danger zone</b>
      <p className="text-sm text-slate-500 mt-1">Delete this bank. Blocked while exams use it (archive instead). Questions are kept and moved to No bank.</p>
      <button className="btn-ghost !text-xs !text-red-600 mt-2" onClick={delBank}>Delete this bank</button>
    </Card>
  </Shell>;
}
