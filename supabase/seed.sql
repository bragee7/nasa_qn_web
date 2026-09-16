-- EXAMORA server seed for a FRESH Supabase project. Run AFTER schema.sql.
-- Auth users + profiles CANNOT be inserted here (auth.users ids are generated at
-- signup). Create them first, then fill in the ids below:
--   1. Auth > Users > Add user: admin@college.edu / Admin@123 (auto-confirm ON)
--   2. Copy that user's UUID -> replace 'ADMIN_UUID' below (3 places)
--   3. Run this file, then Dashboard > Question Banks to verify.

-- clean re-runnable seed (only touches seed ids)
delete from public.exams where id = 'exam_dbms';
delete from public.questions where id in ('q1','q2','q3','q4','q5');
delete from public.question_banks where id = 'seed_bank_dbms';

insert into public.question_banks
  (id, name, description, subject, year, department, section, question_count, status, created_by, created_at, updated_at)
values
  ('seed_bank_dbms', 'DBMS Question Bank', 'Seeded DBMS mid-term questions', 'DBMS', null, array['CSE'], null, 5, 'ACTIVE', 'ADMIN_UUID', 0, 0);

insert into public.questions
  (id, bank_id, text, type, subject, topic, difficulty, options, correct_answer, marks, status, source_order, created_by, created_at, updated_at)
values
  ('q1', 'seed_bank_dbms', 'What is normalization in DBMS?', 'MCQ_SINGLE', 'DBMS', 'Normalization', 'Easy',
   '["Removing redundancy via normal forms","Indexing tables","Backing up data","Sharding"]', '0', 2, 'active', 1, 'ADMIN_UUID', 0, 0),
  ('q2', 'seed_bank_dbms', 'Which normal form eliminates transitive dependency?', 'MCQ_SINGLE', 'DBMS', 'Normalization', 'Medium',
   '["1NF","2NF","3NF","BCNF"]', '2', 2, 'active', 2, 'ADMIN_UUID', 0, 0),
  ('q3', 'seed_bank_dbms', 'SQL stands for?', 'MCQ_SINGLE', 'DBMS', 'SQL', 'Easy',
   '["Structured Query Language","Simple Query List","Sequential Query Logic","Standard Quick Lookup"]', '0', 1, 'active', 3, 'ADMIN_UUID', 0, 0),
  ('q4', 'seed_bank_dbms', 'ACID properties include all except?', 'MCQ_SINGLE', 'DBMS', 'Transactions', 'Hard',
   '["Atomicity","Consistency","Isolation","Normalization"]', '3', 2, 'active', 4, 'ADMIN_UUID', 0, 0),
  ('q5', 'seed_bank_dbms', 'Primary key must be unique and not null.', 'TRUE_FALSE', 'DBMS', 'SQL', 'Easy',
   '["True","False"]', 'true', 1, 'active', 5, 'ADMIN_UUID', 0, 0);

-- exam_dbms mirrors the local dev seed (exam password 'exam123' is verified
-- client-side against password_hash; store a bcrypt hash here if you enforce it
-- server-side, otherwise any non-empty placeholder works for now).
insert into public.exams
  (id, title, description, subject, department, year, section, duration_min, start_at, end_at,
   password_hash, status, total_marks, randomize_questions, randomize_options, one_attempt_only,
   negative_marking, negative_marks, results_release_mode, pass_pct, manual_qids, bank_id,
   created_by, created_at, updated_at)
values
  ('exam_dbms', 'DBMS Mid-Term', 'Mid-term covering SQL & normalization', 'DBMS', array['CSE'], null, null,
   60, 0, 32503680000000,
   'local-dev-placeholder', 'ACTIVE', 8, true, true, true,
   false, 0, 'IMMEDIATE', 40, '["q1","q2","q3","q4","q5"]', 'seed_bank_dbms',
   'ADMIN_UUID', 0, 0);

-- profiles for the users you created in Auth (run AFTER creating them):
-- insert into public.profiles (id, email, role, student_id, name, active) values
--   ('ADMIN_UUID', 'admin@college.edu', 'super_admin', null, 'Super Admin', true),
--   ('ARUN_UUID', 'arun@college.edu', 'student', '23CSE001', 'Arun Kumar', true),
--   ('RAHUL_UUID', 'rahul@college.edu', 'student', '23CSE002', 'Rahul Verma', true),
--   ('PRIYA_UUID', 'priya@college.edu', 'student', '23CSE031', 'Priya Singh', true);
-- insert into public.students (id, student_id, name, email, department, year, section, status, created_at, updated_at) values
--   ('23CSE001', '23CSE001', 'Arun Kumar', 'arun@college.edu', 'CSE', 2, 'A', 'active', 0, 0),
--   ('23CSE002', '23CSE002', 'Rahul Verma', 'rahul@college.edu', 'CSE', 2, 'A', 'active', 0, 0),
--   ('23CSE031', '23CSE031', 'Priya Singh', 'priya@college.edu', 'CSE', 3, 'B', 'active', 0, 0);
