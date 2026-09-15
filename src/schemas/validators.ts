import { z } from 'zod';
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(4) });
export const studentSchema = z.object({
  studentId: z.string().min(3), name: z.string().min(2), email: z.string().email(),
  department: z.string().min(2), year: z.coerce.number().int().min(2).max(3), section: z.string().min(1),
});
export const questionSchema = z.object({
  text: z.string().min(5), type: z.enum(['MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE','SHORT_ANSWER']),
  subject: z.string().min(2), topic: z.string().min(1), difficulty: z.enum(['Easy','Medium','Hard']),
  options: z.array(z.string()).default([]), marks: z.coerce.number().min(0.5).max(20),
}).refine(v => v.type==='TRUE_FALSE' || v.type==='SHORT_ANSWER' || v.options.filter(o=>o.trim()).length>=2, { message: 'MCQ needs ≥2 options', path: ['options'] });
export const examSchema = z.object({
  title: z.string().min(3), description: z.string().default(''), subject: z.string().min(2),
  department: z.array(z.string().min(1)).min(1), year: z.union([z.literal(2),z.literal(3),z.literal('all')]),
  section: z.string().min(1), durationMin: z.coerce.number().int().min(1).max(600),
  startAt: z.string().min(1), endAt: z.string().min(1), password: z.string().min(4),
  randomizeQuestions: z.boolean().default(true), randomizeOptions: z.boolean().default(true),
  oneAttemptOnly: z.boolean().default(true), negativeMarking: z.boolean().default(false),
  negativeMarks: z.coerce.number().min(0).max(5).default(0),
  resultsReleaseMode: z.enum(['IMMEDIATE','MANUAL_RELEASE','SCHEDULED_RELEASE']).default('IMMEDIATE'),
  passPct: z.coerce.number().min(0).max(100).default(40),
}).refine(v => new Date(v.endAt).getTime() > new Date(v.startAt).getTime(), { message: 'End must be after start', path: ['endAt'] });
