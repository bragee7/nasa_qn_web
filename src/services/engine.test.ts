import { describe, it, expect } from 'vitest';
import { scoreAttempt, buildAttempt } from './engine';
const bank:any[]=[
  { id:'q1', type:'MCQ_SINGLE', options:['a','b'], correctAnswer:1, marks:2 },
  { id:'q2', type:'TRUE_FALSE', options:['True','False'], correctAnswer:true, marks:1 },
  { id:'q3', type:'SHORT_ANSWER', options:[], correctAnswer:'acid', marks:2 },
];
const exam:any={ id:'e1', durationMin:60, randomizeQuestions:true, randomizeOptions:true, negativeMarking:true, negativeMarks:0.5, manualQids:['q1','q2','q3'] };
describe('scoring',()=>{
  it('scores objective + negative marking',()=>{
    const r=scoreAttempt(exam,bank,{q1:1,q2:false,q3:'ACID'});
    expect(r.score).toBe(2-0.5+2); expect(r.total).toBe(5);
  });
  it('freezes order reproducibly',()=>{
    const a1=buildAttempt(exam,bank,'s1','u1'); const a2=buildAttempt(exam,bank,'s1','u1');
    expect(a1.questionOrder).toEqual(a2.questionOrder); // same seed
  });
});
