import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Topbar } from './components/layout';
import { RequireAuth, RequireRole } from './components/Protected';
import Login from './pages/Login';
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const ExamTake = lazy(() => import('./pages/student/ExamTake'));
const StudentResult = lazy(() => import('./pages/student/Result'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const Students = lazy(() => import('./pages/admin/Students'));
const ImportStudents = lazy(() => import('./pages/admin/ImportStudents'));
const Exams = lazy(() => import('./pages/admin/Exams'));
const ExamForm = lazy(() => import('./pages/admin/ExamForm'));
const Questions = lazy(() => import('./pages/admin/Questions'));
const QuestionBanks = lazy(() => import('./pages/admin/QuestionBanks'));
const BankDetail = lazy(() => import('./pages/admin/BankDetail'));
const ImportQuestions = lazy(() => import('./pages/admin/ImportQuestions'));
const ImportReview = lazy(() => import('./pages/admin/ImportReview'));
const ImportHistory = lazy(() => import('./pages/admin/ImportHistory'));
const Results = lazy(() => import('./pages/admin/Results'));
const Monitoring = lazy(() => import('./pages/admin/Monitoring'));
const Analytics = lazy(() => import('./pages/admin/Analytics'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const Settings = lazy(() => import('./pages/admin/Settings'));
function PageFallback(){ return <div className="max-w-xl mx-auto p-10 text-center text-slate-500">Loading…</div>; }
export default function App(){
  return <div className="min-h-screen"><Topbar />
    <Suspense fallback={<PageFallback />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/student" element={<RequireRole role="student"><StudentDashboard /></RequireRole>} />
      <Route path="/student/dashboard" element={<RequireRole role="student"><StudentDashboard /></RequireRole>} />
      <Route path="/student/exams" element={<RequireRole role="student"><StudentDashboard /></RequireRole>} />
      <Route path="/student/profile" element={<RequireRole role="student"><StudentDashboard /></RequireRole>} />
      <Route path="/student/exam/:examId" element={<RequireRole role="student"><ExamTake /></RequireRole>} />
      <Route path="/student/result/:attemptId" element={<RequireRole role="student"><StudentResult /></RequireRole>} />
      <Route path="/admin" element={<RequireRole role="super_admin"><AdminDashboard /></RequireRole>} />
      <Route path="/admin/dashboard" element={<RequireRole role="super_admin"><AdminDashboard /></RequireRole>} />
      <Route path="/admin/students" element={<RequireRole role="super_admin"><Students /></RequireRole>} />
      <Route path="/admin/students/import" element={<RequireRole role="super_admin"><ImportStudents /></RequireRole>} />
      <Route path="/admin/exams" element={<RequireRole role="super_admin"><Exams /></RequireRole>} />
      <Route path="/admin/exams/create" element={<RequireRole role="super_admin"><ExamForm /></RequireRole>} />
      <Route path="/admin/exams/:examId" element={<RequireRole role="super_admin"><ExamForm /></RequireRole>} />
      <Route path="/admin/questions" element={<RequireRole role="super_admin"><Questions /></RequireRole>} />
      <Route path="/admin/question-bank" element={<RequireRole role="super_admin"><Questions /></RequireRole>} />
      <Route path="/admin/question-banks" element={<RequireRole role="super_admin"><QuestionBanks /></RequireRole>} />
      <Route path="/admin/question-banks/:bankId" element={<RequireRole role="super_admin"><BankDetail /></RequireRole>} />
      <Route path="/admin/questions/import" element={<RequireRole role="super_admin"><ImportQuestions /></RequireRole>} />
      <Route path="/admin/questions/import/:importId" element={<RequireRole role="super_admin"><ImportReview /></RequireRole>} />
      <Route path="/admin/imports" element={<RequireRole role="super_admin"><ImportHistory /></RequireRole>} />
      <Route path="/admin/results" element={<RequireRole role="super_admin"><Results /></RequireRole>} />
      <Route path="/admin/monitoring" element={<RequireRole role="super_admin"><Monitoring /></RequireRole>} />
      <Route path="/admin/analytics" element={<RequireRole role="super_admin"><Analytics /></RequireRole>} />
      <Route path="/admin/audit-logs" element={<RequireRole role="super_admin"><AuditLogs /></RequireRole>} />
      <Route path="/admin/settings" element={<RequireRole role="super_admin"><Settings /></RequireRole>} />
      <Route path="/" element={<Home />} />
      <Route path="*" element={<div className="max-w-xl mx-auto p-10 text-center">Not found</div>} />
    </Routes>
    </Suspense>
  </div>;
}
import { useSession } from './services/auth';
function Home(){
  const { session } = useSession();
  if(!session) return <Navigate to="/login" replace />;
  return <Navigate to={session.role==='super_admin'?'/admin':'/student'} replace />;
}
