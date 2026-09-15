import { db, sha } from '../lib/store';
import { hashPassword } from '../lib/utils';
import { ensureBankMigration, assignUnbankedToImported } from './banks';
// Dev seed only — never ship credentials to production.
export async function ensureSeed(){
  ensureBankMigration();
  assignUnbankedToImported();
  // v2: fixes users upsert (db.put now keys on uid as well as id). Re-runs once per browser.
  if(localStorage.getItem('examora_seeded_v2')) return;
  const adminHash = await sha('Admin@123');
  db.put('users', { uid:'u_admin', email:'admin@college.edu', passHash:adminHash, role:'super_admin', name:'Super Admin' });
  const students = [
    { id:'23CSE001', studentId:'23CSE001', name:'Arun Kumar', email:'arun@college.edu', department:'CSE', year:2, section:'A' },
    { id:'23CSE002', studentId:'23CSE002', name:'Rahul Verma', email:'rahul@college.edu', department:'CSE', year:2, section:'A' },
    { id:'23CSE031', studentId:'23CSE031', name:'Priya Singh', email:'priya@college.edu', department:'CSE', year:3, section:'B' },
  ];
  for(const s of students){
    db.put('students', { ...s, uid:'u_'+s.id, status:'active', createdAt:Date.now(), updatedAt:Date.now() });
    db.put('users', { uid:'u_'+s.id, email:s.email, passHash: await sha('Student@123'), role:'student', studentId:s.id, name:s.name });
  }
  const qb = [
    { id:'q1', text:'What is normalization in DBMS?', type:'MCQ_SINGLE', subject:'DBMS', topic:'Normalization', difficulty:'Easy', options:['Removing redundancy via normal forms','Indexing tables','Backing up data','Sharding'], correctAnswer:0, marks:2, status:'active', createdBy:'u_admin', createdAt:Date.now(), updatedAt:Date.now() },
    { id:'q2', text:'Which normal form eliminates transitive dependency?', type:'MCQ_SINGLE', subject:'DBMS', topic:'Normalization', difficulty:'Medium', options:['1NF','2NF','3NF','BCNF'], correctAnswer:2, marks:2, status:'active', createdBy:'u_admin', createdAt:Date.now(), updatedAt:Date.now() },
    { id:'q3', text:'SQL stands for?', type:'MCQ_SINGLE', subject:'DBMS', topic:'SQL', difficulty:'Easy', options:['Structured Query Language','Simple Query List','Sequential Query Logic','Standard Quick Lookup'], correctAnswer:0, marks:1, status:'active', createdBy:'u_admin', createdAt:Date.now(), updatedAt:Date.now() },
    { id:'q4', text:'ACID properties include all except?', type:'MCQ_SINGLE', subject:'DBMS', topic:'Transactions', difficulty:'Hard', options:['Atomicity','Consistency','Isolation','Normalization'], correctAnswer:3, marks:2, status:'active', createdBy:'u_admin', createdAt:Date.now(), updatedAt:Date.now() },
    { id:'q5', text:'Primary key must be unique and not null.', type:'TRUE_FALSE', subject:'DBMS', topic:'SQL', difficulty:'Easy', options:['True','False'], correctAnswer:true, marks:1, status:'active', createdBy:'u_admin', createdAt:Date.now(), updatedAt:Date.now() },
  ];
  for(const q of qb) db.put('questionBank', q);
  const pw = await hashPassword('exam123');
  const t=Date.now();
  db.put('exams', { id:'exam_dbms', title:'DBMS Mid-Term', description:'Mid-term covering SQL & normalization', subject:'DBMS', department:['CSE'], year:'all', section:'all', durationMin:60, startAt:t-3600e3, endAt:t+7*86400e3, passwordHash:pw, status:'ACTIVE', totalMarks:8, randomizeQuestions:true, randomizeOptions:true, oneAttemptOnly:true, negativeMarking:false, negativeMarks:0, resultsReleaseMode:'IMMEDIATE', passPct:40, manualQids:['q1','q2','q3','q4','q5'], createdBy:'u_admin', createdAt:t, updatedAt:t });
  localStorage.setItem('examora_seeded_v2','1');
}
