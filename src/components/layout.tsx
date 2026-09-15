import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../services/auth';
import { APP } from '../config/app';
export function Topbar(){ const { session, logout } = useSession(); const nav=useNavigate(); const loc=useLocation();
  const hideBack = loc.pathname === '/' || loc.pathname === '/login';
  const goBack = ()=>{ if (window.history.length > 1) nav(-1); else nav(session ? (session.role === 'super_admin' ? '/admin' : '/student') : '/'); };
  return <header className="bg-white border-b sticky top-0 z-10"><div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
    <div className="flex items-center gap-2">
      {!hideBack && <button className="btn-ghost" onClick={goBack} aria-label="Go back">← Back</button>}
      <Link to="/" className="font-extrabold text-indigo-700 text-lg">{APP.name} <span className="text-xs font-normal text-slate-500 hidden sm:inline">{APP.subtitle}</span></Link>
    </div>
    <div className="flex items-center gap-3 text-sm">{session?<><span className="text-slate-600">{session.name} · {session.role}</span><button className="btn-ghost" onClick={()=>{logout();nav('/login');}}>Logout</button></>:<Link className="btn-primary" to="/login">Login</Link>}</div>
  </div></header>;
}
export function Shell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }){
  return <div className="max-w-7xl mx-auto px-4 py-6 grid md:grid-cols-[220px_1fr] gap-6"><aside className="card h-fit space-y-1 text-sm">{sidebar}</aside><main className="space-y-4 min-w-0">{children}</main></div>;
}
export const SideLink = ({to,label}:{to:string;label:string})=><Link to={to} className="block px-3 py-2 rounded-lg hover:bg-indigo-50 hover:text-indigo-700">{label}</Link>;
