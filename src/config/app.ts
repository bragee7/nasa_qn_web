export const APP = {
  name: import.meta.env.VITE_APP_NAME || 'EXAMORA',
  subtitle: 'College Examination Management Platform',
  timezone: import.meta.env.VITE_COLLEGE_TIMEZONE || 'Asia/Kolkata',
  monitoring: { normalMax: 2, attentionMax: 5 }, // 0-2 NORMAL, 3-5 ATTENTION, 6+ REVIEW
  passPctDefault: 40,
} as const;
export const DEPARTMENTS = ['CSE','IT','ECE','EEE','MECH','CIVIL','CS-Cyber','AI&DS','AERO'] as const;
export const YEARS = [2,3] as const;
export const SECTIONS = ['A','B','C'] as const;
// Default password for every student account: fresh seeds, manual adds,
// Excel imports, and the one-time reset of existing students (see seed.ts).
export const DEFAULT_STUDENT_PASSWORD = 'Jjcet@2k26';
