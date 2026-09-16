// Staff review & approval (spec §21/§22 + §§26-32).
// IRON RULE enforced here: only APPROVED rows enter questionBank, and only
// via the explicit "Import approved → Bank" action. NEEDS_REVIEW rows must be
// resolved first; unresolved duplicates block approval; NOTHING auto-publishes.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Shell, SideLink } from '../../components/layout';
import { Card, Empty } from '../../components/ui';
import { repo } from '../../lib/repo';
import { uid } from '../../lib/utils';
import { useSession } from '../../services/auth';
import type { BankQuestion, Confidence, ImportRecord, StagedQuestion } from '../../services/aiImport/types';
import {
  auditImport, canManageQuestions, getImport, refreshImportCounters,
  removeStaged, setImportStatus, stagedForImport, updateImport, updateStaged,
} from '../../services/aiImport/importStore';
import { getExtractionService, toBankCorrectAnswer } from '../../services/aiImport/providers';
import { allBanks, ensureImportedBank, recomputeCount } from '../../services/banks';
import type { QuestionBank } from '../../types/models';
import { validateStaged } from '../../services/aiImport/pdfParser';

const confColor: Record<Confidence, string> = {
  HIGH: 'bg-emerald-100 text-emerald-800', MEDIUM: 'bg-amber-100 text-amber-800',
  LOW: 'bg-orange-100 text-orange-800', UNKNOWN: 'bg-slate-200 text-slate-600',
};
const statusColor: Record<string, string> = {
  READY: 'bg-emerald-100 text-emerald-800', NEEDS_REVIEW: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-blue-100 text-blue-800', REJECTED: 'bg-slate-200 text-slate-500',
  IMPORTED: 'bg-purple-100 text-purple-800',
};

function srcRef(q: StagedQuestion): string {
  if (q.sourcePage) return `p.${q.sourcePage}${q.sourceQuestionNumber ? ` · Q${q.sourceQuestionNumber}` : ''}`;
  if (q.sourceRow) return `${q.sourceSheet ?? 'sheet'} · row ${q.sourceRow}`;
  return 'source';
}

function answerText(q: StagedQuestion): string {
  if (q.answerDeferred) return '— to be assigned by admin —';
  if (q.type === 'SHORT_ANSWER') return q.expectedText?.trim() ? `“${q.expectedText}”` : '— missing —';
  return q.correctLabels.length ? q.correctLabels.join(', ') : '— missing —';
}

/** Approval gate: valid + answer present (or explicitly deferred) + duplicate resolved. Returns reason or null. */
function blockReason(q: StagedQuestion): string | null {
  if (q.duplicate && !q.duplicateDecision) return 'Resolve the duplicate flag first (KEEP BOTH or SKIP).';
  const errs = validateStaged(q, q.expectedText ?? null, !!q.answerDeferred);
  if (errs.length) return errs[0];
  return null;
}

export default function ImportReview() {
  const { importId } = useParams();
  const { session } = useSession();
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<'ALL' | 'READY' | 'NEEDS_REVIEW' | 'DUPLICATES' | 'APPROVED' | 'REJECTED'>('ALL');
  const [sel, setSel] = useState<string[]>([]);
  const [editing, setEditing] = useState<StagedQuestion | null>(null);
  const [detail, setDetail] = useState<StagedQuestion | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  // Target bank override (null = follow the import record). '' = auto "Imported Questions".
  const [targetBank, setTargetBank] = useState<string | null>(null);
  const [rec, setRec] = useState<ImportRecord | undefined>(undefined);
  const [all, setAll] = useState<StagedQuestion[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(()=>{ (async()=>{
    if (!importId) { setLoaded(true); return; }
    setRec(await getImport(importId));
    setAll(await stagedForImport(importId));
    setBanks(await allBanks(false));
    setLoaded(true);
  })(); },[importId, tick]);

  if (!canManageQuestions(session?.role)) {
    return <Shell sidebar={<></>}><Card><b>Access denied.</b><p className="text-sm">Question imports are restricted to Super Admins.</p></Card></Shell>;
  }
  if (!loaded) {
    return <Shell sidebar={<></>}><Card><b>Loading…</b></Card></Shell>;
  }
  if (!rec) {
    return <Shell sidebar={<></>}><Card><b>Import not found.</b><p className="text-sm mt-1"><Link className="underline" to="/admin/imports">Back to import history</Link></p></Card></Shell>;
  }
  const imp = rec; // narrowed alias — closures below capture this non-optional binding
  const locked = imp.status === 'COMPLETED' || imp.status === 'CANCELLED';
  const rows = all.filter(q =>
    filter === 'ALL' ? true :
    filter === 'DUPLICATES' ? (q.duplicate && !q.duplicateDecision) :
    q.status === filter).sort((a, b) => a.order - b.order); // file order, always
  const n = (s: StagedQuestion['status']) => all.filter(q => q.status === s).length;
  const dupOpen = all.filter(q => q.duplicate && !q.duplicateDecision).length;
  const needsReview = n('NEEDS_REVIEW');
  // Where approved rows land: explicit pick > import record (?bank=) > auto bank.
  const targetBankId = targetBank ?? imp.bankId ?? '';
  const targetBankName = targetBankId
    ? (banks.find(b => b.id === targetBankId)?.name ?? '(unknown bank)')
    : 'Imported Questions (auto-created on import)';

  const reload = async () => { await refreshImportCounters(imp.id); setSel([]); setTick(t => t + 1); };
  const audit = (action: string, targetId: string, metadata: Record<string, unknown> = {}) =>
    auditImport(action, session!.uid, session!.email, imp.id, { targetId, ...metadata });

  async function approveOne(q: StagedQuestion): Promise<boolean> {
    const reason = blockReason(q);
    if (reason) { alert(`Cannot approve: ${reason}`); return false; }
    await updateStaged({ ...q, status: 'APPROVED', approvedBy: session!.email, approvedAt: Date.now() });
    await audit('IMPORT_QUESTION_APPROVED', q.id);
    return true;
  }
  async function approveSelected() {
    let ok = 0, skipped = 0;
    for (const id of sel) {
      const q = all.find(r => r.id === id);
      if (!q || q.status === 'APPROVED' || q.status === 'IMPORTED' || q.status === 'REJECTED') { skipped++; continue; }
      if (!blockReason(q)) {
        await updateStaged({ ...q, status: 'APPROVED', approvedBy: session!.email, approvedAt: Date.now() });
        await audit('IMPORT_QUESTION_APPROVED', q.id, { bulk: true });
        ok++;
      } else skipped++;
    }
    await audit('IMPORT_BULK_APPROVED', imp.id, { approved: ok, skipped });
    alert(`Bulk approve: ${ok} approved${skipped ? `, ${skipped} skipped (invalid, missing answer, or unresolved duplicate)` : ''}.`);
    reload();
  }
  async function rejectSelected() {
    let ok = 0;
    for (const id of sel) {
      const q = all.find(r => r.id === id);
      if (!q || q.status === 'IMPORTED' || q.status === 'REJECTED') continue;
      await updateStaged({ ...q, status: 'REJECTED' });
      await audit('IMPORT_QUESTION_REJECTED', q.id, { bulk: true });
      ok++;
    }
    await audit('IMPORT_BULK_REJECTED', imp.id, { rejected: ok });
    reload();
  }
  async function setDup(q: StagedQuestion, d: 'KEEP_BOTH' | 'SKIP') {
    if (d === 'SKIP') {
      await updateStaged({ ...q, duplicateDecision: d, status: 'REJECTED', reviewNotes: [...q.reviewNotes, 'Skipped as duplicate — never imported, original kept.'] });
      await audit('IMPORT_QUESTION_REJECTED', q.id, { reason: 'duplicate-skip' });
    } else {
      await updateStaged({ ...q, duplicateDecision: d, reviewNotes: [...q.reviewNotes, 'Staff chose KEEP BOTH — imports as a separate bank question.'] });
      await audit('IMPORT_QUESTION_EDITED', q.id, { duplicateDecision: d });
    }
    reload();
  }
  async function askAI(q: StagedQuestion) {
    setAsking(q.id);
    try {
      const svc = getExtractionService();
      const s = await svc.suggestAnswer(q.text, q.options);
      if (!s) { alert('No AI suggestion available. The local provider never guesses — enter the answer manually, or configure a cloud provider in Settings.'); return; }
      await updateStaged({
        ...q, correctLabels: s.labels, aiSuggested: true,
        answerSource: `AI suggested (${s.rationale}) — awaiting staff approval`,
      });
      await audit('IMPORT_AI_SUGGESTED', q.id, { labels: s.labels });
      reload();
    } catch (e: any) {
      alert(e?.message || 'AI suggestion failed.');
    } finally { setAsking(null); }
  }

  async function finalImport() {
    const fresh = await stagedForImport(imp.id);
    if (fresh.some(q => q.status === 'NEEDS_REVIEW')) {
      alert('Resolve all NEEDS_REVIEW items first (approve, fix, or reject them).');
      return;
    }
    const approved = fresh.filter(q => q.status === 'APPROVED' && q.duplicateDecision !== 'SKIP')
      .sort((a, b) => a.order - b.order); // bank insert preserves file order
    if (!approved.length) { alert('Nothing approved to import.'); return; }
    // Resolve the destination bank FIRST so approved rows can never land bankless
    // (bankless rows are invisible in exam creation). '' = auto "Imported Questions".
    const bankId = targetBankId || (await ensureImportedBank(session!.email)).id;
    const bankName = banks.find(b => b.id === bankId)?.name ?? 'Imported Questions';
    if (!confirm(`Import ${approved.length} APPROVED question(s) into “${bankName}” as ACTIVE? Only approved rows enter — rejected and unapproved rows stay out.`)) return;
    let count = 0;
    for (const q of approved) {
      const ca = toBankCorrectAnswer(q.type, q.options, q.correctLabels, q.expectedText ?? undefined);
      const bank: BankQuestion = {
        id: uid('q'), text: q.text, type: q.type, subject: q.subject, topic: q.topic,
        difficulty: q.difficulty, options: q.options.map(o => o.text),
        correctAnswer: ca, needsAnswer: ca == null, questionBankId: bankId,
        sourceOrder: q.order,
        marks: q.marks, status: 'active',
        sourceImportId: imp.id, sourceFileName: imp.fileName,
        sourcePage: q.sourcePage, sourceRow: q.sourceRow, sourceSheet: q.sourceSheet,
        sourceQuestionNumber: q.sourceQuestionNumber,
        createdBy: session!.uid, createdAt: Date.now(), updatedAt: Date.now(),
      };
      await repo.put('questionBank', bank);
      await updateStaged({ ...q, status: 'IMPORTED', importedQuestionId: bank.id });
      count++;
    }
    await recomputeCount(bankId);
    await audit('QUESTIONS_IMPORTED_TO_BANK', bankId, { importId: imp.id, count });
    await setImportStatus(imp.id, 'COMPLETED', { importedQuestions: count, bankId });
    await audit('IMPORT_COMPLETED', imp.id, { imported: count, bankId });
    await refreshImportCounters(imp.id);
    setTick(t => t + 1);
  }

  const toggle = (id: string) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return <Shell sidebar={<>
    <SideLink to="/admin/questions" label="Question Bank" />
    <SideLink to="/admin/questions/import" label="New Import" />
    <SideLink to="/admin/imports" label="Import History" />
    <SideLink to="/admin/dashboard" label="Dashboard" />
  </>}>
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <b>Review import</b>
          <p className="text-xs text-slate-500">{imp.fileName} · {imp.fileType.toUpperCase()} · provider {imp.provider}</p>
        </div>
        <span className="text-xs px-2 py-1 rounded bg-slate-100">READY {n('READY')}</span>
        <span className="text-xs px-2 py-1 rounded bg-amber-100">NEEDS REVIEW {needsReview}</span>
        <span className="text-xs px-2 py-1 rounded bg-blue-100">APPROVED {n('APPROVED')}</span>
        <span className="text-xs px-2 py-1 rounded bg-slate-200">REJECTED {n('REJECTED')}</span>
        <span className="text-xs px-2 py-1 rounded bg-purple-100">IMPORTED {n('IMPORTED')}</span>
        {dupOpen > 0 && <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">⚠ {dupOpen} duplicate(s) undecided</span>}
      </div>
      {imp.status === 'COMPLETED'
        ? <p className="text-sm mt-2 text-purple-700">Import complete — {imp.importedQuestions} question(s) entered the bank as ACTIVE. This review is read-only.</p>
        : <p className="text-sm mt-2">AI extraction never publishes. Approve each row (or fix it first) — only APPROVED rows can enter the bank.</p>}
    </Card>

    {!locked && <Card><div className="flex flex-wrap gap-2 items-center">
      <select className="input !w-44" value={filter} onChange={e => setFilter(e.target.value as any)}>
        <option value="ALL">All ({all.length})</option>
        <option value="READY">Ready</option>
        <option value="NEEDS_REVIEW">Needs review</option>
        <option value="DUPLICATES">Duplicates undecided</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
      </select>
      <button className="btn-ghost !text-xs" onClick={() => setSel(rows.map(r => r.id))}>Select all ({rows.length})</button>
      <button className="btn-ghost !text-xs" onClick={() => setSel([])}>Clear</button>
      <span className="text-xs text-slate-500">{sel.length} selected</span>
      <button className="btn-primary !text-xs" disabled={!sel.length} onClick={approveSelected}>Approve selected</button>
      <button className="btn-ghost !text-xs" disabled={!sel.length} onClick={rejectSelected}>Reject selected</button>
      <label className="text-xs text-slate-600 ml-auto">Into bank:
        <select
          className="input !w-52 !text-xs ml-1"
          title="Approved rows will be saved into this bank. Auto creates an “Imported Questions” bank."
          value={targetBankId}
          onChange={async e => {
            const v = e.target.value;
            setTargetBank(v);
            await updateImport(imp.id, { bankId: v || undefined });
            setTick(t => t + 1);
          }}
        >
          <option value="">Auto — Imported Questions</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.name} ({b.questionCount})</option>)}
        </select>
      </label>
      <button className="btn-primary !text-xs" onClick={finalImport}>Import approved → {targetBankName}</button>
    </div></Card>}

    {rows.length === 0 ? <Empty title="No rows match this filter." /> : rows.map(q => <Card key={q.id}>
      <div className="flex gap-2 items-start">
        {!locked && <input type="checkbox" className="mt-1" checked={sel.includes(q.id)} onChange={() => toggle(q.id)} />}
        <div className="mr-auto min-w-0">
          <p className="text-sm whitespace-pre-wrap"><b>Q{q.order}</b> {q.text}</p>
          <p className="text-xs text-slate-500 mt-1">
            {q.type} · {q.subject}/{q.topic}/{q.difficulty} · {q.marks}m · source: {srcRef(q)}
          </p>
          <p className="text-xs mt-1">Answer: <b>{answerText(q)}</b>
            {q.aiSuggested && <span className="ml-1 px-1 rounded bg-violet-100 text-violet-700">AI SUGGESTED — verify</span>}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className={`text-xs px-1.5 py-0.5 rounded ${statusColor[q.status]}`}>{q.status.replace('_', ' ')}</span>
            {q.answerDeferred && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">answer deferred — assign in bank</span>}
            <span className={`text-xs px-1.5 py-0.5 rounded ${confColor[q.extractionConfidence]}`}>extract {q.extractionConfidence}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${confColor[q.answerConfidence]}`}>answer {q.answerConfidence}</span>
            {q.duplicate && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">possible duplicate {q.duplicate.similarity}%</span>}
          </div>
          {q.validationErrors.length > 0 && <p className="text-xs text-red-600 mt-1">⚠ {q.validationErrors.join(' ')}</p>}
          {q.duplicate && !q.duplicateDecision && !locked && <div className="flex gap-2 mt-2 items-center flex-wrap">
            <span className="text-xs">Similar to bank: “{q.duplicate.existingText.slice(0, 80)}…” ({q.duplicate.similarity}%)</span>
            <button className="btn-ghost !text-xs" onClick={() => setDup(q, 'KEEP_BOTH')}>Keep both</button>
            <button className="btn-ghost !text-xs" onClick={() => setDup(q, 'SKIP')}>Skip (keep original)</button>
          </div>}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button className="btn-ghost !text-xs" onClick={() => setDetail(q)}>Details</button>
          {!locked && q.status !== 'IMPORTED' && <>
            <button className="btn-ghost !text-xs" onClick={() => setEditing({ ...q })}>Edit</button>
            {q.status !== 'APPROVED' && <button className="btn-ghost !text-xs" onClick={async () => { if (await approveOne(q)) reload(); }}>Approve</button>}
            {q.status !== 'REJECTED' && <button className="btn-ghost !text-xs" onClick={async () => { await updateStaged({ ...q, status: 'REJECTED' }); await audit('IMPORT_QUESTION_REJECTED', q.id); reload(); }}>Reject</button>}
            {blockReason(q) && q.status === 'NEEDS_REVIEW' && !q.correctLabels.length && q.type !== 'SHORT_ANSWER' && (
              <button className="btn-ghost !text-xs" disabled={asking === q.id} onClick={() => askAI(q)}>
                {asking === q.id ? 'Asking…' : 'Ask AI suggestion'}
              </button>)}
            <button className="btn-ghost !text-xs !text-red-600" onClick={async () => { if (confirm('Delete this staged row? It never reaches the bank.')) { await removeStaged(q.id); await audit('IMPORT_QUESTION_DELETED', q.id); reload(); } }}>Delete</button>
          </>}
        </div>
      </div>
    </Card>)}

    {detail && <DetailModal q={detail} onClose={() => setDetail(null)} />}
    {editing && <EditModal q={editing} onClose={() => setEditing(null)} onSave={async (q) => {
      const next: StagedQuestion = { ...q };
      // Staff-entered answer clears an earlier deferral and counts as HIGH-confidence.
      const staffAnswered = next.type === 'SHORT_ANSWER'
        ? !!next.expectedText?.trim()
        : next.correctLabels.length > 0;
      if (next.answerDeferred && staffAnswered) {
        next.answerDeferred = false;
        next.answerConfidence = 'HIGH';
        next.answerSource = 'Entered by staff during review';
        next.reviewNotes = [...next.reviewNotes, 'Correct answer entered by staff during review.'];
      }
      const errs = validateStaged(next, next.expectedText ?? null, !!next.answerDeferred);
      next.validationErrors = errs;
      next.editedBy = session!.email;
      const missingAnswer = !next.answerDeferred &&
        (next.type === 'SHORT_ANSWER' ? !next.expectedText?.trim() : next.correctLabels.length === 0);
      if (next.status === 'APPROVED' && (errs.length || missingAnswer)) next.status = 'NEEDS_REVIEW';
      // Re-derive READY vs NEEDS_REVIEW for non-approved rows too.
      if (next.status === 'READY' || next.status === 'NEEDS_REVIEW') {
        next.status = (errs.length || blockReason(next)) ? 'NEEDS_REVIEW' : 'READY';
      }
      await updateStaged(next);
      await audit('IMPORT_QUESTION_EDITED', q.id);
      setEditing(null); reload();
    }} />}
  </Shell>;
}

function DetailModal({ q, onClose }: { q: StagedQuestion; onClose: () => void }) {
  return <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[85vh] overflow-auto p-5" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2"><b className="mr-auto">Question detail</b><button className="btn-ghost !text-xs" onClick={onClose}>Close</button></div>
      <p className="text-sm mt-2 whitespace-pre-wrap">{q.text}</p>
      {q.options.length > 0 && <ul className="text-sm mt-2 list-none space-y-1">
        {q.options.map(o => <li key={o.label} className={q.correctLabels.includes(o.label) ? 'font-bold text-emerald-700' : ''}>
          {o.label}. {o.text} {q.correctLabels.includes(o.label) ? '✓' : ''}</li>)}
      </ul>}
      <div className="grid sm:grid-cols-2 gap-2 mt-3 text-xs">
        <p><b>Type:</b> {q.type}</p><p><b>Marks:</b> {q.marks}</p>
        <p><b>Subject / Topic:</b> {q.subject} / {q.topic} (AI suggestion — overridable)</p>
        <p><b>Difficulty:</b> {q.difficulty} (confidence {q.difficultyConfidence}%)</p>
        <p><b>Extraction confidence:</b> {q.extractionConfidence}</p>
        <p><b>Answer confidence:</b> {q.answerConfidence}{q.aiSuggested ? ' (AI SUGGESTED)' : ''}{q.answerDeferred ? ' — deferred: admin assigns A/B/C/D in the bank after import' : ''}</p>
        <p className="sm:col-span-2"><b>Answer provenance:</b> {q.answerSource}</p>
        <p className="sm:col-span-2"><b>Source:</b> {srcRef(q)}</p>
        {q.duplicate && <p className="sm:col-span-2"><b>Duplicate check:</b> {q.duplicate.similarity}% similar to bank question “{q.duplicate.existingText.slice(0, 120)}…” — decision: {q.duplicateDecision ?? 'pending (KEEP BOTH / SKIP, never auto-deleted)'}</p>}
        {q.validationErrors.length > 0 && <p className="sm:col-span-2 text-red-600"><b>Validation:</b> {q.validationErrors.join(' ')}</p>}
        {q.reviewNotes.length > 0 && <div className="sm:col-span-2"><b>Review notes:</b><ul className="list-disc ml-5">{q.reviewNotes.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        {(q.editedBy || q.approvedBy) && <p className="sm:col-span-2 text-slate-500">Provenance: {q.editedBy ? `edited by ${q.editedBy}` : ''}{q.approvedBy ? ` · approved by ${q.approvedBy}` : ''}</p>}
      </div>
    </div>
  </div>;
}

function EditModal({ q, onClose, onSave }: { q: StagedQuestion; onClose: () => void; onSave: (q: StagedQuestion) => void }) {
  const [f, setF] = useState({
    text: q.text, type: q.type,
    options: q.options.map(o => `${o.label}. ${o.text}`).join('\n'),
    correctLabels: q.correctLabels.join(', '), expectedText: q.expectedText ?? '',
    marks: q.marks, subject: q.subject, topic: q.topic, difficulty: q.difficulty,
    note: '',
  });
  const set = (k: string, v: any) => setF(s => ({ ...s, [k]: v }));
  function save() {
    const options = f.options.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
      const m = l.match(/^([A-Ea-e])[\).:\-]\s*(.*)$/);
      return m ? { label: m[1].toUpperCase(), text: m[2] } : { label: 'ABCDE'[i] ?? `X${i}`, text: l };
    });
    onSave({
      ...q, text: f.text, type: f.type as StagedQuestion['type'], options,
      correctLabels: f.correctLabels.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-E]$/.test(s)),
      expectedText: f.expectedText.trim() ? f.expectedText.trim() : null,
      marks: Number(f.marks) > 0 ? Number(f.marks) : 1,
      subject: f.subject.trim() || q.subject, topic: f.topic.trim() || q.topic,
      difficulty: f.difficulty as StagedQuestion['difficulty'],
      reviewNotes: f.note.trim() ? [...q.reviewNotes, f.note.trim()] : q.reviewNotes,
    });
  }
  return <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[85vh] overflow-auto p-5" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2"><b className="mr-auto">Edit staged question</b><button className="btn-ghost !text-xs" onClick={onClose}>Cancel</button></div>
      <div className="grid gap-2 mt-3">
        <textarea className="input" rows={3} value={f.text} onChange={e => set('text', e.target.value)} />
        <div className="grid sm:grid-cols-3 gap-2">
          <select className="input" value={f.type} onChange={e => set('type', e.target.value)}>
            <option>MCQ_SINGLE</option><option>MCQ_MULTIPLE</option><option>TRUE_FALSE</option><option>SHORT_ANSWER</option>
          </select>
          <input className="input" type="number" min={1} value={f.marks} onChange={e => set('marks', e.target.value)} />
          <select className="input" value={f.difficulty} onChange={e => set('difficulty', e.target.value)}>
            <option>Easy</option><option>Medium</option><option>Hard</option>
          </select>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <input className="input" placeholder="Subject (suggestion — override)" value={f.subject} onChange={e => set('subject', e.target.value)} />
          <input className="input" placeholder="Topic (suggestion — override)" value={f.topic} onChange={e => set('topic', e.target.value)} />
        </div>
        <textarea className="input" rows={4} placeholder={'Options, one per line: A. ...'} value={f.options} onChange={e => set('options', e.target.value)} />
        <div className="grid sm:grid-cols-2 gap-2">
          <input className="input" placeholder="Correct labels, e.g. B or A, C" value={f.correctLabels} onChange={e => set('correctLabels', e.target.value)} />
          <input className="input" placeholder="Expected text (SHORT_ANSWER)" value={f.expectedText} onChange={e => set('expectedText', e.target.value)} />
        </div>
        <input className="input" placeholder="Review note (optional)" value={f.note} onChange={e => set('note', e.target.value)} />
        <button className="btn-primary" onClick={save}>Save changes</button>
      </div>
    </div>
  </div>;
}
