// Admin → Question Bank → Import Questions: upload, validate, extract, analyze.
// Pipeline: UPLOAD → VALIDATE → EXTRACT → (OCR if scanned) → AI ANALYSIS
// → STRUCTURE → VALIDATE → DUPLICATE CHECK → REVIEW. Nothing is published
// here — analyzed rows are staged for mandatory staff review.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Shell, SideLink } from '../../components/layout';
import { Card } from '../../components/ui';
import { repo } from '../../lib/repo';
import { uid } from '../../lib/utils';
import { useSession } from '../../services/auth';
import { getBank } from '../../services/banks';
import { validateFile } from '../../services/aiImport/validation';
import {
  extractDocxText, extractPdfPages, extractWorkbook, chunkTextToPages, pageNeedsOcr, type SheetData,
} from '../../services/aiImport/extractors';
import { renderPageToCanvas, ocrCanvas } from '../../services/aiImport/ocr';
import {
  autoMapColumns, FIELD_LABELS, type CanonicalField, type ColumnMapping,
} from '../../services/aiImport/excelMapper';
import { getExtractionService } from '../../services/aiImport/providers';
import { findDuplicate } from '../../services/aiImport/duplicates';
import {
  createImport, addStagedBulk, refreshImportCounters, setImportStatus,
  deleteImport, auditImport, canManageQuestions, updateImport,
} from '../../services/aiImport/importStore';
import type { FileKind, ImportRecord, StagedQuestion } from '../../services/aiImport/types';
import type { QuestionBank } from '../../types/models';

type Phase = 'pick' | 'sheet' | 'mapping' | 'analyzing' | 'summary' | 'failed';
interface Step { label: string; state: 'todo' | 'active' | 'done' | 'skip'; detail?: string; }

const tick = () => new Promise(r => setTimeout(r, 30));

export default function ImportQuestions() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Launched from a bank's “Import Into Bank” link (?bank=…) — approved rows land in that bank.
  const targetBankId = params.get('bank') || undefined;
  const [targetBank,setTargetBank]=useState<QuestionBank|undefined>(undefined);
  useEffect(()=>{ if(targetBankId) getBank(targetBankId).then(setTargetBank); },[targetBankId]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<FileKind | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetName, setSheetName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [importId, setImportId] = useState('');
  const [summary, setSummary] = useState<ImportRecord | null>(null);
  const [failMsg, setFailMsg] = useState('');
  const [errorReport, setErrorReport] = useState<string[]>([]);
  const [deferAnswers, setDeferAnswers] = useState(false);

  if (!canManageQuestions(session?.role)) {
    return <Shell sidebar={<></>}><Card><b>Access denied.</b><p className="text-sm mt-1">Question imports are restricted to Super Admin.</p></Card></Shell>;
  }

  function pick(f: File | undefined) {
    if (!f) return;
    const v = validateFile(f);
    setFile(f); setKind(v.kind);
    setProblems(v.errors); setWarnings(v.warnings);
    if (v.ok) { setPhase('pick'); }
  }

  async function startAnalyze() {
    if (!file || !kind) return;
    setProblems([]); setWarnings([]); setErrorReport([]); setFailMsg('');
    if (kind === 'pdf') { await runPdfPipeline(file); return; }
    if (kind === 'docx') { await runDocxPipeline(file); return; }
    // spreadsheet: parse workbook first (cheap, local) for sheet/mapping steps
    try {
      const wb = await extractWorkbook(file);
      const usable = wb.sheets.filter(s => s.headers.length > 0 && s.rows.length > 0);
      if (usable.length === 0) throw new Error('No data rows found. The first non-empty row should contain column headers (e.g. Question, Option A, Answer, Marks).');
      setSheets(usable);
      if (usable.length === 1) chooseSheet(usable[0], wb.sheets);
      else { setPhase('sheet'); }
    } catch (e: any) { fail('', [e.message || 'Could not read this file.']); }
  }

  function chooseSheet(sh: SheetData, all?: SheetData[]) {
    if (all) setSheets(all);
    setSheetName(sh.name); setHeaders(sh.headers);
    const auto = autoMapColumns(sh.headers);
    setMapping(auto.mapping);
    if (auto.uncertain) setPhase('mapping');
    else runRowsPipeline(sh, auto.mapping);
  }

  function updateMapping(field: CanonicalField, header: string | null) {
    setMapping(prev => prev.map(m => m.field === field ? { ...m, header, auto: false } : m));
  }

  function currentSheet(): SheetData | undefined {
    return sheets.find(s => s.name === sheetName);
  }

  // ---------- PDF pipeline ----------
  async function runPdfPipeline(f: File) {
    const rec = await createImport({
      id: uid('imp'), fileName: f.name, fileType: 'pdf', fileSize: f.size, bankId: targetBankId,
      uploadedBy: session!.uid, uploadedByEmail: session!.email, uploadedAt: Date.now(),
      provider: getExtractionService().id, totalQuestions: 0, readyQuestions: 0,
      reviewQuestions: 0, rejectedQuestions: 0, importedQuestions: 0, duplicateQuestions: 0,
      status: 'PROCESSING', errorReport: [],
    });
    setImportId(rec.id);
    await auditImport('QUESTION_IMPORT_STARTED', session!.uid, session!.email, rec.id, { fileName: f.name, skipAnswers: deferAnswers, bankId: targetBankId });
    const st: Step[] = [
      { label: 'Uploading', state: 'done' },
      { label: 'Extracting text', state: 'active' },
      { label: 'Running OCR (scanned pages)', state: 'todo' },
      { label: 'Detecting questions & answers', state: 'todo' },
      { label: 'Validating & duplicate check', state: 'todo' },
    ];
    const paint = () => setSteps([...st]);
    paint(); setPhase('analyzing'); await tick();
    try {
      const { pages, pageCount, pdf } = await extractPdfPages(f, (d, t) => {
        st[1].detail = `Page ${d}/${t}`; paint();
      });
      await updateImportMeta(rec.id, { pageCount });
      // OCR fallback for scan pages
      const scanIdx = pages.map((p, i) => (pageNeedsOcr(p.text) ? i : -1)).filter(i => i >= 0);
      st[1].state = 'done';
      if (scanIdx.length === 0) { st[2].state = 'skip'; st[2].detail = 'All pages have selectable text'; }
      else {
        st[2].state = 'active'; paint();
        for (let k = 0; k < scanIdx.length; k++) {
          const i = scanIdx[k];
          st[2].detail = `Page ${pages[i].pageNumber} (${k + 1}/${scanIdx.length})`; paint();
          const canvas = await renderPageToCanvas(pdf, pages[i].pageNumber);
          const ocrText = await ocrCanvas(canvas, pct => { st[2].detail = `Page ${pages[i].pageNumber} — ${Math.round(pct * 100)}%`; paint(); });
          if (ocrText.trim()) pages[i] = { ...pages[i], text: ocrText };
          await tick();
        }
      }
      st[2].state = st[2].state === 'active' ? 'done' : st[2].state;
      st[3].state = 'active'; paint(); await tick();
      const svc = getExtractionService();
      const res = await svc.extract({ kind: 'pdf-text', pages, importId: rec.id, fileName: f.name, skipAnswers: deferAnswers });
      st[3].state = 'done'; st[3].detail = `${res.staged.length} question(s)${res.answerKeyEntries ? `, ${res.answerKeyEntries} answer-key entries` : ''}`;
      st[4].state = 'active'; paint(); await tick();
      await finishAnalysis(rec.id, res.staged, res.warnings);
      st[4].state = 'done'; paint();
    } catch (e: any) {
      await fail(rec.id, [e.message || 'Analysis failed for an unknown reason.']);
    }
  }

  // ---------- Word (.docx) pipeline: extract text → parse like document text ----------
  async function runDocxPipeline(f: File) {
    const rec = await createImport({
      id: uid('imp'), fileName: f.name, fileType: 'docx', fileSize: f.size, bankId: targetBankId,
      uploadedBy: session!.uid, uploadedByEmail: session!.email, uploadedAt: Date.now(),
      provider: getExtractionService().id, totalQuestions: 0, readyQuestions: 0,
      reviewQuestions: 0, rejectedQuestions: 0, importedQuestions: 0, duplicateQuestions: 0,
      status: 'PROCESSING', errorReport: [],
    });
    setImportId(rec.id);
    await auditImport('QUESTION_IMPORT_STARTED', session!.uid, session!.email, rec.id, { fileName: f.name, skipAnswers: deferAnswers, bankId: targetBankId });
    const st: Step[] = [
      { label: 'Uploading', state: 'done' },
      { label: 'Extracting document text', state: 'active' },
      { label: 'Detecting questions & answers', state: 'todo' },
      { label: 'Validating & duplicate check', state: 'todo' },
    ];
    const paint = () => setSteps([...st]);
    paint(); setPhase('analyzing'); await tick();
    try {
      const { text, messages } = await extractDocxText(f);
      const pages = chunkTextToPages(text);
      if (pages.length === 0) {
        throw new Error('No readable text found in this Word file. If the questions are pictures/scans inside the document, export it as PDF instead (scanned PDFs get OCR).');
      }
      await updateImportMeta(rec.id, { pageCount: pages.length });
      st[1].state = 'done'; st[1].detail = `${pages.length} section(s)`;
      st[2].state = 'active'; paint(); await tick();
      const svc = getExtractionService();
      const res = await svc.extract({ kind: 'pdf-text', pages, importId: rec.id, fileName: f.name, skipAnswers: deferAnswers });
      st[2].state = 'done'; st[2].detail = `${res.staged.length} question(s)${res.answerKeyEntries ? `, ${res.answerKeyEntries} answer-key entries` : ''}`;
      st[3].state = 'active'; paint(); await tick();
      await finishAnalysis(rec.id, res.staged, [...messages.map(m => `Word conversion note: ${m}`), ...res.warnings]);
      st[3].state = 'done'; paint();
    } catch (e: any) {
      await fail(rec.id, [e.message || 'Analysis failed for an unknown reason.']);
    }
  }

  // ---------- spreadsheet pipeline ----------
  async function runRowsPipeline(sh: SheetData, map: ColumnMapping[]) {
    const f = file!;
    const rec = await createImport({
      id: uid('imp'), fileName: f.name, fileType: kind!, fileSize: f.size, bankId: targetBankId,
      uploadedBy: session!.uid, uploadedByEmail: session!.email, uploadedAt: Date.now(),
      provider: getExtractionService().id, sheetName: sh.name,
      totalQuestions: 0, readyQuestions: 0, reviewQuestions: 0,
      rejectedQuestions: 0, importedQuestions: 0, duplicateQuestions: 0,
      status: 'PROCESSING', errorReport: [],
    });
    setImportId(rec.id);
    await auditImport('QUESTION_IMPORT_STARTED', session!.uid, session!.email, rec.id, { fileName: f.name, sheet: sh.name, skipAnswers: deferAnswers, bankId: targetBankId });
    const st: Step[] = [
      { label: 'Uploading', state: 'done' },
      { label: 'Reading worksheet', state: 'done', detail: `${sh.rows.length} row(s) in “${sh.name}”` },
      { label: 'Detecting questions & answers', state: 'active' },
      { label: 'Validating & duplicate check', state: 'todo' },
    ];
    setSteps([...st]); setPhase('analyzing'); await tick();
    try {
      const svc = getExtractionService();
      const res = await svc.extract({ kind: 'rows', rows: sh.rows, mapping: map, sheet: sh.name, importId: rec.id, fileName: f.name, skipAnswers: deferAnswers });
      st[2].state = 'done'; st[2].detail = `${res.staged.length} question(s)${res.skippedRows ? `, ${res.skippedRows} blank row(s) skipped` : ''}`;
      st[3].state = 'active'; setSteps([...st]); await tick();
      finishAnalysis(rec.id, res.staged, res.warnings);
      st[3].state = 'done'; setSteps([...st]);
    } catch (e: any) {
      fail(rec.id, [e.message || 'Analysis failed for an unknown reason.']);
    }
  }

  async function finishAnalysis(id: string, staged: StagedQuestion[], warningsList: string[]) {
    if (staged.length === 0) {
      await fail(id, ['No questions could be detected in this file. Check the format (numbered questions with options, or a header row like Question | Option A | Answer | Marks) and try again.', ...warningsList]);
      return;
    }
    const bank = await repo.all<any>('questionBank');
    for (const q of staged) {
      const hit = findDuplicate(q.text, bank);
      if (hit) {
        q.duplicate = hit;
        q.reviewNotes.push(`Possible duplicate of an existing question (${hit.similarity}% similar). Decide: keep both or skip.`);
      }
    }
    await addStagedBulk(staged);
    const rec = await refreshImportCounters(id);
    await setImportStatus(id, 'REVIEW');
    const full = { ...(rec as unknown as ImportRecord), status: 'REVIEW' as const };
    setSummary(full);
    await auditImport('QUESTION_AI_EXTRACTED', session!.uid, session!.email, id, {
      total: full.totalQuestions, ready: full.readyQuestions, review: full.reviewQuestions,
    });
    setPhase('summary');
  }

  async function updateImportMeta(id: string, patch: Partial<ImportRecord>) {
    await updateImport(id, patch);
  }

  async function fail(id: string, errs: string[]) {
    setErrorReport(errs);
    setFailMsg(errs[0] || 'Analysis failed.');
    if (id) {
      await setImportStatus(id, 'FAILED', { errorReport: errs });
      await auditImport('QUESTION_IMPORT_FAILED', session!.uid, session!.email, id, { errors: errs.slice(0, 5) });
      setImportId(id);
    }
    setPhase('failed');
  }

  function downloadErrorReport() {
    const blob = new Blob([JSON.stringify({
      file: file?.name, kind, importedAt: new Date().toISOString(), errors: errorReport,
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `import-error-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function cancelImport() {
    if (importId) await deleteImport(importId);
    setImportId(''); setSummary(null); setFile(null); setPhase('pick');
  }

  const FIELDS: CanonicalField[] = ['text', 'optionA', 'optionB', 'optionC', 'optionD', 'optionE', 'answer', 'marks', 'subject', 'topic', 'difficulty', 'type'];

  return <Shell sidebar={<>
    <SideLink to="/admin/questions" label="Question Bank" />
    <SideLink to="/admin/imports" label="Import History" />
    <SideLink to="/admin/dashboard" label="Dashboard" />
  </>}>
    <Card><div className="flex items-center gap-3 flex-wrap">
      <div><b>Import questions</b><p className="text-sm text-slate-500">Upload a question paper or dataset — AI structures it, <b>you</b> review and approve. Nothing enters the Question Bank automatically.</p>
      {targetBankId
        ? <p className="text-sm mt-1 text-indigo-700">🎯 Target bank: <b>{targetBank ? targetBank.name : '(unknown bank)'}</b> — approved rows will be tagged into this bank. <Link className="underline" to={`/admin/question-banks/${targetBankId}`}>View bank</Link></p>
        : <p className="text-sm mt-1 text-slate-500">No target bank — approved rows will go to the <b>Imported Questions</b> bank (you can change this on the review screen). Tip: start the import from a bank's “Import Into Bank” button to file rows directly there.</p>}</div>
    </div></Card>

    {phase === 'pick' && <Card>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0]); }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300'}`}>
        <div className="text-4xl">📄</div>
        <p className="mt-2 font-medium">{file ? file.name : 'Drop file here'}</p>
        <p className="text-sm text-slate-500">or Browse files</p>
        <p className="text-xs text-slate-500 mt-2">Supported: PDF, Word (.docx), XLSX, XLS, CSV</p>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.xlsx,.xls,.csv" className="hidden" onChange={e => pick(e.target.files?.[0])} />
      </div>
      {warnings.map((w, i) => <p key={i} className="text-xs text-amber-700 mt-2">⚠ {w}</p>)}
      {problems.map((p, i) => <p key={i} className="text-sm text-red-600 mt-2">{p}</p>)}
      {file && problems.length === 0 && <label className="flex items-start gap-2 mt-3 text-sm cursor-pointer">
        <input type="checkbox" className="mt-1" checked={deferAnswers} onChange={e => setDeferAnswers(e.target.checked)} />
        <span>I'll assign the correct answers (A / B / C / D) myself later — import questions without answers.</span>
      </label>}
      {file && problems.length === 0 && <button className="btn-primary mt-4" onClick={startAnalyze}>Analyze file</button>}
    </Card>}

    {phase === 'sheet' && <Card><b>Choose worksheet</b><p className="text-sm text-slate-500">This workbook has multiple sheets with data. Pick the one containing questions.</p>
      <div className="mt-3 space-y-2">{sheets.map(s => <button key={s.name} className="btn-ghost w-full !justify-between" onClick={() => chooseSheet(s)}><span>📄 {s.name}</span><span className="text-xs text-slate-500">{s.rows.length} rows</span></button>)}</div>
    </Card>}

    {phase === 'mapping' && <Card><b>Confirm column mapping</b><p className="text-sm text-slate-500">Automatic detection was uncertain. Map each field to the correct column, then continue.</p>
      <div className="grid sm:grid-cols-2 gap-2 mt-3">{FIELDS.map(f => (
        <label key={f} className="text-sm"><span className="label">{FIELD_LABELS[f]}{f === 'text' ? ' *' : ''}</span>
          <select className="input" value={mapping.find(m => m.field === f)?.header ?? ''} onChange={e => updateMapping(f, e.target.value || null)}>
            <option value="">— ignore —</option>
            {headers.map(h => <option key={h} value={h}>{h}</option>)}
          </select></label>
      ))}</div>
      {!mapping.find(m => m.field === 'text')?.header && <p className="text-sm text-red-600 mt-2">The Question column is required.</p>}
      <button className="btn-primary mt-3" disabled={!mapping.find(m => m.field === 'text')?.header} onClick={() => currentSheet() && runRowsPipeline(currentSheet()!, mapping)}>Continue analysis</button>
    </Card>}

    {phase === 'analyzing' && <Card><b>Analyzing question paper</b>
      <div className="mt-3 space-y-2">{steps.map((s, i) => <div key={i} className="flex items-center gap-2 text-sm">
        <span>{s.state === 'done' ? '✓' : s.state === 'active' ? '⟳' : s.state === 'skip' ? '○' : '○'}</span>
        <span className={s.state === 'active' ? 'font-medium' : 'text-slate-600'}>{s.label}</span>
        {s.detail && <span className="text-xs text-slate-500">— {s.detail}</span>}
      </div>)}</div>
      <p className="text-xs text-slate-500 mt-3">Large files are processed in chunks so the page stays responsive.</p>
    </Card>}

    {phase === 'summary' && summary && <Card>
      <b>Analysis complete</b>
      <p className="text-sm mt-1">File: {summary.fileName}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center">
        <div className="border rounded-lg p-3"><div className="text-2xl font-bold">{summary.totalQuestions}</div><div className="text-xs text-slate-500">Questions found</div></div>
        <div className="border rounded-lg p-3"><div className="text-2xl font-bold text-green-700">{summary.readyQuestions}</div><div className="text-xs text-slate-500">Ready</div></div>
        <div className="border rounded-lg p-3"><div className="text-2xl font-bold text-amber-700">{summary.reviewQuestions}</div><div className="text-xs text-slate-500">Needs review</div></div>
        <div className="border rounded-lg p-3"><div className="text-2xl font-bold text-purple-700">{summary.duplicateQuestions}</div><div className="text-xs text-slate-500">Possible duplicates</div></div>
      </div>
      <p className="text-xs text-slate-500 mt-3">Errors: {summary.rejectedQuestions} · AI extraction ≠ publication — review every question before import.</p>
      <div className="flex gap-2 mt-3">
        <button className="btn-primary" onClick={() => navigate(`/admin/questions/import/${summary.id}`)}>Review questions</button>
        <button className="btn-ghost" onClick={cancelImport}>Cancel import</button>
      </div>
    </Card>}

    {phase === 'failed' && <Card><b>⚠ Analysis failed</b>
      <p className="text-sm mt-1">{failMsg}</p>
      <div className="text-sm text-slate-600 mt-2">Possible reasons:
        <ul className="list-disc ml-5"><li>File is corrupted</li><li>Unsupported structure</li><li>OCR failed (scanned PDF)</li><li>Question format could not be detected</li></ul></div>
      <p className="text-xs text-slate-500 mt-2">Your original file was not lost — it never leaves your machine in this offline build.</p>
      <div className="flex gap-2 mt-3 flex-wrap">
        <button className="btn-primary" onClick={startAnalyze}>Try again</button>
        <button className="btn-ghost" onClick={downloadErrorReport}>Download error report</button>
        <button className="btn-ghost" onClick={cancelImport}>Cancel</button>
      </div>
    </Card>}

    <Card><Link className="text-sm text-blue-700 underline" to="/admin/imports">View import history →</Link></Card>
  </Shell>;
}
