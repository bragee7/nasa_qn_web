import { Routes, Route, Navigate } from 'react-router-dom';
import { Topbar } from './components/layout';
import { RequireAuth, RequireRole } from './components/Protected';
import Login from './pages/Login';
import StudentDashboard from './pages/student/Dashboard';
import ExamTake from './pages/student/ExamTake';
import StudentResult from './pages/student/Result';
import AdminDashboard from './pages/admin/Dashboard';
import Students from './pages/admin/Students';
import ImportStudents from './pages/admin/ImportStudents';
import Exams from './pages/admin/Exams';
import ExamForm from './pages/admin/ExamForm';
import Questions from './pages/admin/Questions';
import QuestionBanks from './pages/admin/QuestionBanks';
import BankDetail from './pages/admin/BankDetail';
import ImportQuestions from './pages/admin/ImportQuestions';
import ImportReview from './pages/admin/ImportReview';
import ImportHistory from './pages/admin/ImportHistory';
import Results from './pages/admin/Results';
import Monitoring from './pages/admin/Monitoring';
import Analytics from './pages/admin/Analytics';
import AuditLogs from './pages/admin/AuditLogs';
import Settings from './pages/admin/Settings';
export default function App(){
  return <div className="min-h-screen"><Topbar />
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
  </div>;
}
import { useSession } from './services/auth';
function Home(){
  const { session } = useSession();
  if(!session) return <Navigate to="/login" replace />;
  return <Navigate to={session.role==='super_admin'?'/admin':'/student'} replace />;
}
