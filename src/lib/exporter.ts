import * as XLSX from 'xlsx';
// Authenticated admin-only export (called from admin UI, never public URL).
export function exportResultsWorkbook(attempts:any[], students:Map<string,any>, exams:any[]){
  const examName=(id:string)=>exams.find(e=>e.id===id)?.title??id;
  const results=attempts.map(a=>{ const s=students.get(a.studentId)??{}; const tot=(a.tabSwitchCount||0)+(a.fsExitCount||0)+(a.refreshCount||0)+(a.netDiscCount||0);
    return { 'Register No':s.studentId, Name:s.name, Email:s.email, Department:s.department, Year:s.year, Section:s.section, Exam:examName(a.examId), Score:a.score, Monitoring:tot, 'Submission Type':a.submissionType, 'Started At':new Date(a.startedAt).toISOString(), 'Submitted At':a.submittedAt?new Date(a.submittedAt).toISOString():'' }; });
  const monitoring=attempts.map(a=>{ const s=students.get(a.studentId)??{}; const tot=(a.tabSwitchCount||0)+(a.fsExitCount||0)+(a.refreshCount||0)+(a.netDiscCount||0);
    return { 'Register No':s.studentId, Name:s.name, Exam:examName(a.examId), 'Tab Switches':a.tabSwitchCount||0, 'Fullscreen Exits':a.fsExitCount||0, Refreshes:a.refreshCount||0, Disconnects:a.netDiscCount||0, Monitoring:tot, Status:tot<=2?'NORMAL':tot<=5?'ATTENTION':'REVIEW' }; });
  const events=JSON.parse(localStorage.getItem('examora_events')||'[]').filter((e:any)=>attempts.some(a=>a.id===e.attemptId))
    .map((e:any)=>({ 'Register No':students.get(e.studentId)?.studentId, Exam:examName(e.examId), 'Event Type':e.eventType, Timestamp:new Date(e.timestamp).toISOString(), Metadata:JSON.stringify(e.metadata||{}) }));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(results),'Results');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(monitoring),'Monitoring');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(events),'Event Timeline');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{Metric:'Total attempts',Value:attempts.length}]),'Analytics');
  XLSX.writeFile(wb,`examora_export_${Date.now()}.xlsx`);
}
