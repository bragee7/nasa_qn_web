import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
export const Card = ({children, className}:{children:ReactNode;className?:string})=><div className={cn('card',className)}>{children}</div>;
export const Badge = ({children,color}:{children:ReactNode;color?:string})=><span className={cn('badge',color??'bg-slate-100 text-slate-700')}>{children}</span>;
export const statusColor = (s:string)=> s==='ACTIVE'?'bg-green-100 text-green-700': s==='SCHEDULED'?'bg-blue-100 text-blue-700': s==='COMPLETED'?'bg-slate-200 text-slate-700': s==='DRAFT'?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600';
export const Empty = ({title,sub}:{title:string;sub?:string})=><div className="card text-center py-10"><p className="font-semibold">{title}</p>{sub&&<p className="text-sm text-slate-500 mt-1">{sub}</p>}</div>;
export const Loading = ({msg='Loading...'}:{msg?:string})=><div className="card text-center text-slate-500" role="status">{msg}</div>;
