# EXAMORA — College Examination Management Platform

## Quick start
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest
npm run build    # production build
```
No Supabase project needed to run: app uses local-first store (`localStorage`, same collection layout as Postgres §46). Add real Supabase keys in `.env` to go live.

Demo logins (seeded): `admin@college.edu / Admin@123`, `arun@college.edu / Jjcet@2k26` (exam password `exam123`). Default student password (`DEFAULT_STUDENT_PASSWORD`): `Jjcet@2k26` — applies to seeded, manually added, and Excel-imported students; existing student accounts are reset to it one-time on next boot.

## Supabase setup (NEW project — NOT the existing "zelda")
1. Create a NEW project at supabase.com (leave the existing zelda project untouched).
2. In the new project: SQL Editor → paste & run `supabase/schema.sql` (creates tables, RLS, the `questions_public` safe view, `submit_attempt` + `log_exam_event` RPCs, storage bucket). Then paste & run `supabase/seed.sql` — edit ADMIN_UUID first (see file header) and create the auth users as noted.
3. Auth → Settings → turn OFF "Confirm email" for campus logins (or leave on for invite flow).
4. Copy `.env.example` → `.env`, fill `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (Project Settings → API).
5. Create student logins: Dashboard → Authentication → Add user (email + password) + insert the matching `profiles` + `students` rows per `seed.sql` notes.

## Deploy (Vercel + Supabase)
- Vercel: import repo, set `VITE_SUPABASE_*` envs, build `npm run build`, output `dist`. `vercel.json` handles SPA rewrites.
- Supabase hosts Auth/Postgres/Storage (RLS enforces: students never read `correct_answer`).

## Project status
Frontend: COMPLETE · Backend: Supabase (local-first fallback) · Auth/RBAC: COMPLETE · Question Bank: COMPLETE · Exam engine (timer/fullscreen/tab/offline/autosave/auto-submit/one-attempt): COMPLETE · Monitoring timeline: COMPLETE · Results/analytics: COMPLETE · Excel import/export: COMPLETE · RLS: COMPLETE · AI-assisted question import (PDF/Word/Excel/CSV + review/approval, file order + answer-deferral): COMPLETE · Tests: COMPLETE (vitest, 53 tests) · Deployment: READY — needs NEW Supabase project URL + anon key pasted into `.env` (app runs offline on local mock store until then)

## AI-assisted question bank import
- Admin → Question Bank → **Import File** (or `/admin/questions/import`). Flow: UPLOAD → VALIDATE → EXTRACT → (OCR if scanned) → STRUCTURE → STAFF REVIEW → APPROVAL → BANK. Accepted: PDF (text + scanned via OCR), Word (.docx; text only — embedded images are skipped), XLSX/XLS/CSV (column auto-mapping + manual confirm).
- **Iron rule:** AI never auto-publishes. Extraction stages rows outside `questionBank`; only APPROVED rows enter the bank (as ACTIVE) via the explicit "Import approved → Bank" action. NEEDS_REVIEW rows must be resolved first; unresolved duplicates block approval.
- **Answers are never guessed:** missing/unrecognized answers → NEEDS_REVIEW with ENTER ANSWER (edit modal) or ASK AI SUGGESTION (marked AI SUGGESTED, staff must still approve). Local provider always declines to guess.
- Review: `/admin/questions/import/:importId` — filter, multi-select + bulk approve/reject, edit modal, detail modal (confidences, provenance, source page/row), duplicate resolution (KEEP BOTH / SKIP, never auto-delete). History: `/admin/imports`. **Destination bank:** pick it on the review screen (“Into bank”); default is the auto-created **Imported Questions** bank, so approved rows can never land bankless and invisible in exam creation. Questions approved before this default existed are auto-moved there on next app boot.
- Providers: `local` (default, offline, free) | `gemini` | `openai` | `ollama` — switch in Settings or `VITE_AI_PROVIDER`. Cloud providers call the `analyzeImport` Cloud Function (holds keys server-side; browser never sees them) and fail closed until configured — see `functions/src/index.ts`.
- Limits (Settings, defaults PDF 20 MB / Excel+Word+CSV 10 MB), private Storage `imports/` path, admin-only Firestore `questionImports`/`importQuestions`, audit actions IMPORT_STARTED/COMPLETED/FAILED/AI_EXTRACTED/QUESTION_APPROVED/REJECTED/EDITED/BULK_*.
- **File order & deferred answers:** imports preserve document order (Q1..Qn, options A→D) and code indentation/line-breaks end to end (staged `order` → review sort → bank `sourceOrder`; uncheck the exam's randomize boxes to serve file order). Tick “I'll assign the correct answers myself later” at upload to import without answers; set A/B/C/D per question afterwards in the bank (pending badge + “Missing answer” filter, `QUESTION_ANSWER_SET` audit). Exam creation warns if selected questions still lack answers.

## Named question banks
- Admin → **Question Banks** (`/admin/question-banks`): create named, reusable banks (name required + subject/year/department/section/description), search/filter/sort, duplicate as independent “(Version 2)” copies, archive/restore, **delete** (blocked while exams use the bank — archive instead; its questions are kept, moved to No bank; `QUESTION_BANK_DELETED` audit). Dates shown in Asia/Kolkata.
- Bank detail (`/admin/question-banks/:bankId`): edit metadata, quick-add, add-by-ID, **Import Into Bank** (`/admin/questions/import?bank=…` — approved rows auto-tagged), Q1..Qn file-order list, ↑/↓ reorder, remove (unassigns, keeps row), per-question answer quick-set, **multi-select + bulk delete** (checkboxes, Select all, Delete selected with confirm; published exams unaffected — frozen snapshots). The All Questions page (`/admin/questions`) has the same multi-select + Delete selected.
- Exam creation selects ONE bank — all its active questions auto-included, total marks auto-computed, VIEW QUESTIONS preview, publish validation; the bank's content is frozen onto the exam as `questionSnapshot` at save AND refreshed on publish, so later bank edits never change a published exam. Legacy manual-question exams keep working unchanged.
- Audit: QUESTION_BANK_CREATED/UPDATED/ARCHIVED/DUPLICATED/QUESTION_ADDED_TO_BANK/QUESTION_REMOVED_FROM_BANK/QUESTIONS_IMPORTED_TO_BANK.

## Known limitations
- SHORT_ANSWER auto-grade is exact-match; subjective grading queue is manual in v1.
- Charts are lightweight CSS bars (no chart lib to keep bundle small).
- Bulk import creates default password `Jjcet@2k26` — force reset in production.
- Multi-tab concurrency guarded by single active attempt per exam; true distributed locks need Firestore transactions in live mode.
