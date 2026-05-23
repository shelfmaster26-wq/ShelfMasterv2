-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.auth_users (
  id text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  verified boolean DEFAULT false,
  verification_token text,
  created_at timestamp with time zone DEFAULT now(),
  reset_token text,
  reset_token_expires timestamp with time zone,
  verification_token_expires timestamp with time zone,
  CONSTRAINT auth_users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.book_copies (
  id text NOT NULL,
  book_id text NOT NULL,
  copy_number integer NOT NULL DEFAULT 1,
  accession_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'available'::text,
  date_acquired date,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT book_copies_pkey PRIMARY KEY (id),
  CONSTRAINT book_copies_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id)
);
CREATE TABLE public.books (
  id text NOT NULL,
  accession_num text,
  barcode text,
  title text NOT NULL,
  authors text,
  quantity integer DEFAULT 1,
  date_acquired date,
  edition text,
  pages integer,
  book_type text,
  subject_class text,
  category text,
  cost_price numeric,
  publisher text,
  isbn text,
  copyright text,
  source text,
  remark text,
  status text DEFAULT 'active'::text,
  cover_image text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT books_pkey PRIMARY KEY (id)
);
CREATE TABLE public.fine_policy (
  id integer NOT NULL,
  fine_amount numeric DEFAULT 5,
  fine_per_day numeric DEFAULT 5,
  fine_increment_value integer DEFAULT 1,
  fine_increment_type text DEFAULT 'per_day'::text,
  borrow_duration_value integer DEFAULT 7,
  borrow_duration_unit text DEFAULT 'days'::text,
  updated_at timestamp with time zone,
  max_borrow_count integer DEFAULT 3,
  CONSTRAINT fine_policy_pkey PRIMARY KEY (id)
);
CREATE TABLE public.fines (
  id text NOT NULL,
  transaction_id text,
  user_id text,
  amount numeric NOT NULL DEFAULT 0,
  overdue_days integer DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid'::text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fines_pkey PRIMARY KEY (id),
  CONSTRAINT fines_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id),
  CONSTRAINT fines_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.notifications (
  id text NOT NULL,
  user_id text,
  fine_id text,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  email_sent boolean DEFAULT false,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  transaction_id text,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT notifications_fine_id_fkey FOREIGN KEY (fine_id) REFERENCES public.fines(id)
);
CREATE TABLE public.site_content (
  id integer NOT NULL,
  hero_banner_url text,
  tagline text,
  about_text text,
  mission text,
  vision text,
  contact_email text,
  contact_phone text,
  contact_location text,
  footer_text text,
  strands text DEFAULT '...'::text,
  CONSTRAINT site_content_pkey PRIMARY KEY (id)
);
CREATE TABLE public.transactions (
  id text NOT NULL,
  user_id text,
  book_id text,
  copy_id text,
  transaction_type text,
  status text DEFAULT 'pending'::text,
  borrow_date timestamp with time zone,
  due_date timestamp with time zone,
  return_date timestamp with time zone,
  fine_amount numeric DEFAULT 0,
  walk_in_name text,
  walk_in_grade_section text,
  walk_in_lrn text,
  walk_in_teacher text,
  walk_in_employee_id text,
  walk_in_department text,
  walk_in_contact text,
  walk_in_position text,
  created_at timestamp with time zone DEFAULT now(),
  fine_id text,
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT transactions_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id),
  CONSTRAINT transactions_copy_id_fkey FOREIGN KEY (copy_id) REFERENCES public.book_copies(id),
  CONSTRAINT transactions_fine_id_fkey FOREIGN KEY (fine_id) REFERENCES public.fines(id)
);
CREATE TABLE public.users (
  id text NOT NULL,
  auth_id text,
  name text,
  student_id text,
  course_year text,
  grade_section text,
  lrn text,
  role text DEFAULT 'student'::text,
  status text DEFAULT 'active'::text,
  archived_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  contact_number text,
  adviser text,
  position text,
  section text,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
-- ═══════════════════════════════════════════════════════
-- NEW FIELDS & TABLES (added for feature update)
-- ═══════════════════════════════════════════════════════

-- 1. Books: borrowable settings
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS is_borrowable boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_borrowable_copies integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS borrow_duration_days integer DEFAULT NULL;

-- 2. Users: expanded roles
-- role column now supports: 'student', 'teacher', 'librarian', 'assistant_librarian', 'head_librarian'
-- There is exactly ONE head_librarian account (the designated admin).
-- assistant_librarian accounts are created by the head librarian via the User Management page.
-- The `position` column is repurposed for assistant librarian specialization:
--   'borrowing'  -> can handle pending requests, walk-in borrowing, process returns
--   'inventory'  -> can manage the book catalog and inventory
-- No schema change needed — role and position are already text columns.

-- 3. Transactions: expanded status workflow
-- status column now supports:
--   'pending'   -> student submitted a borrow request
--   'approved'  -> librarian approved, book assigned
--   'declined'  -> librarian declined the request
--   'released'  -> librarian physically released the book for pickup
--   'claimed'   -> student picked up the book
--   'returned'  -> book has been returned
--   'overdue'   -> past due date without return
--   'reserved'  -> student reserved a book that is currently unavailable (fallback)
-- No schema change needed — status is already a text column.

-- 4. Reservations table (new)
CREATE TABLE IF NOT EXISTS public.reservations (
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL,
  book_id text NOT NULL,
  status text NOT NULL DEFAULT 'waiting',  -- 'waiting' | 'fulfilled' | 'cancelled'
  created_at timestamp with time zone DEFAULT now(),
  notified_at timestamp with time zone DEFAULT NULL,
  CONSTRAINT reservations_pkey PRIMARY KEY (id),
  CONSTRAINT reservations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT reservations_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id)
);
