// Import history (spec §43): every import attempt with status, counts, and
// actions. Failed/cancelled imports can be retried (re-upload) or securely
// deleted; completed imports keep their bank questions even if the record is
// removed (provenance lives on the bank rows via sourceImportId).
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shell, SideLink } from '../../components/layout';
import { Card, Empty } from '../../components/ui';
import { useSession } from '../../services/auth';
import { auditImport, canManageQuestions, deleteImport, listImports } from '../../services/aiImport/importStore';
import type { ImportRecord } from '../../services/aiImport/types';

const pill: Record<string, string> = {
  UPLOADED: 'bg-slate-200 text-slate-600', PROCESSING: 'bg-amber-100 text-amber-800',
  REVIEW: 'bg-blue-100 text-blue-800', APPROVED: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800', FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-200 text-slate-500',
};

export default function ImportHistory() {
  const { session } = useSession();
  const [rows,setRows]=useState<ImportRecord[]>([]);
  const refresh=async()=>setRows(await listImports());
  useEffect(()=>{ refresh(); },[]);
  if (!canManageQuestions(session?.role)) {
    return <Shell sidebar={<></>}><Card><b>Access denied.</b><p className="text-sm">Question imports are restricted to Super Admins.</p></Card></Shell>;
  }
  return <Shell sidebar={<>
    <SideLink to="/admin/questions" label="Question Bank" />
    <SideLink to="/admin/questions/import" label="New Import" />
    <SideLink to="/admin/imports" label="Import History" />
    <SideLink to="/admin/dashboard" label="Dashboard" />
  </>}>
    <Card><div className="flex items-center gap-2">
      <div className="mr-auto"><b>Question import history</b>
        <p className="text-xs text-slate-500">Every upload, extraction, review decision, and completion is recorded here and in the audit log.</p></div>
      <Link className="btn-primary !text-xs" to="/admin/questions/import">+ New import</Link>
    </div></Card>
    {rows.length === 0 ? <Empty title="No imports yet." /> : rows.map(r => <Card key={r.id}>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="mr-auto min-w-0">
          <p className="text-sm"><b>{r.fileName}</b> <span className="text-slate-500">· {r.fileType.toUpperCase()} · {(r.fileSize / 1024).toFixed(0)} KB · provider {r.provider}</span></p>
          <p className="text-xs text-slate-500 mt-0.5">
            {new Date(r.uploadedAt).toLocaleString()} · by {r.uploadedByEmail} ·
            total {r.totalQuestions} · ready {r.readyQuestions} · review {r.reviewQuestions} ·
            rejected {r.rejectedQuestions} · imported {r.importedQuestions}
            {r.duplicateQuestions > 0 && <> · duplicates {r.duplicateQuestions}</>}
          </p>
          {r.status === 'FAILED' && r.errorReport.length > 0 && <p className="text-xs text-red-600 mt-0.5">⚠ {r.errorReport[0]}</p>}
        </div>
        <span className={`text-xs px-2 py-1 rounded ${pill[r.status] ?? pill.UPLOADED}`}>{r.status}</span>
        {(r.status === 'REVIEW' || r.status === 'PROCESSING' || r.status === 'UPLOADED' || r.status === 'FAILED') &&
          <Link className="btn-primary !text-xs" to={`/admin/questions/import/${r.id}`}>Open review</Link>}
        {r.status === 'COMPLETED' &&
          <Link className="btn-ghost !text-xs" to={`/admin/questions/import/${r.id}`}>View</Link>}
        <button className="btn-ghost !text-xs !text-red-600" onClick={async() => {
          if (!confirm(`Delete import record for “${r.fileName}”? Staged rows are removed. Questions already imported into the bank are kept.`)) return;
          await auditImport('IMPORT_CANCELLED', session!.uid, session!.email, r.id, { deletedFromHistory: true });
          await deleteImport(r.id);
          refresh();
        }}>Delete</button>
      </div>
    </Card>)}
  </Shell>;
}
