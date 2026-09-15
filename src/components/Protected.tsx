import { Navigate } from 'react-router-dom';
import { useSession } from '../services/auth';
export function RequireAuth({children}:{children:JSX.Element}){
  const { session } = useSession();
  if(!session) return <Navigate to="/login" replace />;
  return children;
}
export function RequireRole({role,children}:{role:string;children:JSX.Element}){
  const { session } = useSession();
  if(!session) return <Navigate to="/login" replace />;
  if(session.role!==role) return <Navigate to={session.role==='super_admin'?'/admin':'/student'} replace />;
  return children;
}
