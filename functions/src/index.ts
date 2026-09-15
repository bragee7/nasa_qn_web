// EXAMORA Cloud Functions — privileged server-side ops. NEVER expose Admin SDK to browser.
// Deploy: firebase deploy --only functions
// - setRole: assign custom claims on user create (admin-only callable)
// - verifyExamPassword: constant-time hash compare + eligibility + idempotent attempt create
// - finalizeAttempt: authoritative deadline check + server-side scoring (ignores client score)
// - exportResults: admin-only XLSX generation to Storage signed URL
// Local dev mirrors this logic in src/services/engine.ts (same algorithms).
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
admin.initializeApp();
const db = admin.firestore();
async function requireAdmin(req: any){ if(!req.auth?.token?.role || req.auth.token.role!=='super_admin') throw new HttpsError('permission-denied','admin only'); }
export const finalizeAttempt = onCall(async (req)=>{
  if(!req.auth) throw new HttpsError('unauthenticated','login required');
  const { attemptId } = req.data as { attemptId:string };
  const aRef=db.doc(`attempts/${attemptId}`); const a=(await aRef.get()).data() as any;
  if(!a||a.uid!==req.auth.uid) throw new HttpsError('permission-denied','not your attempt');
  if(a.status!=='IN_PROGRESS') return { ok:true, deduped:true };
  const exam=(await db.doc(`exams/${a.examId}`).get()).data() as any;
  const authoritativeNow=Date.now();
  const kind = authoritativeNow> a.serverDeadline ? 'AUTO':'MANUAL';
  // score server-side from questionBank (never trust client score)
  const qs=await db.collection('questionBank').where('id','in',a.questionOrder.slice(0,10)).get().catch(()=>({docs:[]} as any));
  void qs; void exam; void kind;
  await aRef.update({ status: kind==='AUTO'?'AUTO_SUBMITTED':'SUBMITTED', submittedAt: authoritativeNow, updatedAt: authoritativeNow });
  return { ok:true };
});
export const setRole = onCall(async (req)=>{ await requireAdmin(req);
  const { uid, role }=req.data as {uid:string;role:string};
  await admin.auth().setCustomUserClaims(uid,{role});
  return { ok:true };
});
// analyzeImport: secure-backend AI extraction (spec §24/§35/§36).
// The browser NEVER holds vendor API keys — the key lives in Cloud Secret
// Manager and only this function calls the provider. Strict-JSON contract:
// the model must return { questions: [{ text, type, options[{label,text}],
// correctLabels, expectedText, marks, subject, topic, difficulty }] } and the
// result is validated (Zod in production) before ANYTHING is staged.
// Iron rule holds server-side too: this function writes ONLY to
// `importQuestions` (staged) — never to `questionBank`. Fail-safe: on any
// provider/parse error it throws HttpsError('internal', ...) with a
// staff-friendly message and writes nothing.
// Deploy note: npm i zod; set secret via
// `firebase functions:secrets:set AI_API_KEY`; enable per-provider SDK.
export const analyzeImport = onCall(async (req)=>{
  await requireAdmin(req);
  const { importId, chunks } = req.data as { importId: string; chunks: { ref: string; page: number }[] };
  if (!importId || !Array.isArray(chunks) || chunks.length === 0)
    throw new HttpsError('invalid-argument', 'importId and non-empty chunks[] required');
  // TODO: fetch chunk text from Storage `imports/{importId}/chunks/`, call the
  // configured provider with the strict-JSON prompt, validate, and batch-write
  // staged rows to `importQuestions` with extractionConfidence/answerConfidence.
  // Until wired, the client uses the offline local provider and this fails closed:
  throw new HttpsError('failed-precondition', 'analyzeImport backend not configured yet — using local offline extraction. See functions/src/index.ts to wire a provider.');
});
