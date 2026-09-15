// Exam engine: attempt lifecycle, randomization (frozen per attempt), secure scoring.
// Mirrors Cloud Functions logic in functions/src/index.ts — same algorithm, auditable.
import { db } from '../lib/store';
import { seededRand, shuffle } from '../lib/utils';
import type { Attempt, Exam, Question } from '../types/models';
export function buildAttempt(exam: Exam, bank: Question[], studentId: string, uid: string): Attempt {
  let pool: Question[] = bank.filter(q=>q.status==='active');
  if(exam.questionSnapshot?.length){
    // Frozen exam: question SET + ORDER come from the publish-time snapshot.
    // Live bank rows supply grading data; missing rows fall back to snapshot text (display-only, score 0).
    const byId=new Map(bank.map(q=>[q.id,q]));
    pool=exam.questionSnapshot.map(s=>byId.get(s.qid) ?? { id:s.qid, text:s.text, type:s.type, subject:'', topic:'', difficulty:'Medium', options:s.options, correctAnswer:null, marks:s.marks, status:'active', createdBy:'', createdAt:0, updatedAt:0 } as Question);
  }
  else if(exam.manualQids?.length){ const set=new Set(exam.manualQids); pool=pool.filter(q=>set.has(q.id)); }
  else if(exam.pool){ const pick=(d:string,n:number)=>shuffle(pool.filter(q=>q.difficulty===d)).slice(0,n);
    pool=[...pick('Easy',exam.pool.easy),...pick('Medium',exam.pool.medium),...pick('Hard',exam.pool.hard)]; }
  const rand=seededRand(exam.id+studentId);
  const qOrder=shuffle(pool.map(q=>q.id), rand);
  const optionOrder: Record<string,number[]>={};
  for(const q of pool){ const idx=q.options.map((_,i)=>i); optionOrder[q.id]=exam.randomizeOptions&&q.options.length>1?shuffle(idx,rand):idx; }
  const startedAt=Date.now();
  return { id: crypto.randomUUID(), studentId, uid, examId: exam.id, status:'IN_PROGRESS', startedAt,
    serverDeadline: startedAt+exam.durationMin*60000, questionOrder: exam.randomizeQuestions?qOrder:pool.map(q=>q.id),
    optionOrder, currentIndex:0, answers:{}, tabSwitchCount:0, fsExitCount:0, refreshCount:0, netDiscCount:0, updatedAt:Date.now() };
}
export function scoreAttempt(exam: Exam, bank: Question[], answers: Record<string,any>): { score:number; total:number; pct:number } {
  const byId=new Map(bank.map(q=>[q.id,q])); let score=0,total=0;
  for(const [qid,val] of Object.entries(answers)){ const q=byId.get(qid); if(!q) continue; total+=q.marks;
    let ok=false;
    if(q.type==='MCQ_SINGLE') ok=val===q.correctAnswer;
    else if(q.type==='MCQ_MULTIPLE') ok=Array.isArray(val)&&[...val].sort().join(',')===[...(q.correctAnswer as number[])].sort().join(',');
    else if(q.type==='TRUE_FALSE') ok=val===q.correctAnswer;
    else if(q.type==='SHORT_ANSWER') ok=String(val??'').trim().toLowerCase()===String(q.correctAnswer).trim().toLowerCase();
    if(ok) score+=q.marks; else if(exam.negativeMarking) score-=exam.negativeMarks;
  }
  // unanswered in order count 0 but add their marks to total
  score=Math.max(0,Math.round(score*100)/100);
  const fullTotal=bank.reduce((s,q)=>s+q.marks,0);
  const pct=fullTotal?Math.round(score/fullTotal*100):0;
  return { score, total: fullTotal, pct };
}
export function logEvent(attemptId:string, examId:string, studentId:string, eventType:string, metadata:Record<string,any>={}){
  const evs=db.all<any>('events');
  const existing=db.get<Attempt>('attempts',attemptId);
  if(existing){ // maintain server-side counters (never trust client counts)
    if(eventType==='TAB_SWITCH') existing.tabSwitchCount++;
    if(eventType==='FULLSCREEN_EXIT') existing.fsExitCount++;
    if(eventType==='BROWSER_REFRESH') existing.refreshCount++;
    if(eventType==='NETWORK_DISCONNECTED') existing.netDiscCount++;
    existing.updatedAt=Date.now(); db.put('attempts',existing);
  }
  evs.push({ id: crypto.randomUUID(), attemptId, examId, studentId, eventType, timestamp: Date.now(), metadata });
  localStorage.setItem('examora_events', JSON.stringify(evs));
}
