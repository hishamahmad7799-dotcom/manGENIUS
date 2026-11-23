-- =============================================================================
-- ManGENIUS Staffing LLC — Supabase Database, RLS & Private Storage Setup
-- Run this entire script in: Supabase Dashboard -> SQL Editor -> New Query
-- =============================================================================

-- Ensure UUID generation is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. CONTACT SUBMISSIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2 AND char_length(full_name) <= 150),
  email             TEXT NOT NULL CHECK (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND char_length(email) <= 254),
  phone             TEXT NOT NULL CHECK (char_length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 7 AND 15),
  organization_name TEXT CHECK (organization_name IS NULL OR char_length(organization_name) <= 200),
  contacting_as     TEXT NOT NULL CHECK (
                      contacting_as IN (
                        'Employer',
                        'Job Seeker',
                        'Educational Institution',
                        'Healthcare Organization',
                        'Other'
                      )
                    ),
  subject           TEXT NOT NULL CHECK (
                      subject IN (
                        'Information Technology Staffing',
                        'Special Education Staffing',
                        'Healthcare Staffing',
                        'General Enquiry'
                      )
                    ),
  message           TEXT NOT NULL CHECK (char_length(trim(message)) >= 10 AND char_length(message) <= 5000),
  source_page       TEXT NOT NULL DEFAULT 'contact.html',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at
  ON public.contact_submissions (created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. RESUME SUBMISSIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resume_submissions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name                   TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2 AND char_length(full_name) <= 150),
  email                       TEXT NOT NULL CHECK (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND char_length(email) <= 254),
  phone                       TEXT NOT NULL CHECK (char_length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 7 AND 15),
  preferred_staffing_area     TEXT CHECK (
                                preferred_staffing_area IS NULL OR preferred_staffing_area IN (
                                  'Information Technology',
                                  'Special Education',
                                  'Healthcare'
                                )
                              ),
  relevant_experience         TEXT CHECK (relevant_experience IS NULL OR (char_length(trim(relevant_experience)) >= 3 AND char_length(relevant_experience) <= 500)),
  zip_code                    TEXT CHECK (zip_code IS NULL OR (char_length(trim(zip_code)) BETWEEN 3 AND 12)),
  location                    TEXT CHECK (location IS NULL OR (char_length(trim(location)) >= 2 AND char_length(location) <= 200)),
  message                     TEXT NOT NULL CHECK (char_length(trim(message)) >= 10 AND char_length(message) <= 5000),
  resume_file_path            TEXT NOT NULL CHECK (char_length(trim(resume_file_path)) >= 5 AND resume_file_path LIKE 'applications/%'),
  resume_file_name            TEXT NOT NULL CHECK (char_length(trim(resume_file_name)) >= 1 AND char_length(resume_file_name) <= 255),
  resume_file_size            INTEGER NOT NULL CHECK (resume_file_size > 0 AND resume_file_size <= 10485760),
  resume_mime_type            TEXT NOT NULL CHECK (
                                resume_mime_type IN (
                                  'application/pdf',
                                  'application/msword',
                                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                                )
                              ),
  privacy_acknowledged        BOOLEAN NOT NULL CHECK (privacy_acknowledged = true),
  future_opportunities_opt_in BOOLEAN NOT NULL DEFAULT false,
  source_page                 TEXT NOT NULL DEFAULT 'careers.html',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_submissions_created_at
  ON public.resume_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resume_submissions_area
  ON public.resume_submissions (preferred_staffing_area);

-- -----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) — WRITE-ONLY FOR WEBSITE VISITORS
-- -----------------------------------------------------------------------------
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_submissions  ENABLE ROW LEVEL SECURITY;

-- Revoke broad default privileges and grant only INSERT to anon/authenticated
REVOKE ALL ON TABLE public.contact_submissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.resume_submissions  FROM anon, authenticated;
GRANT INSERT ON TABLE public.contact_submissions TO anon, authenticated;
GRANT INSERT ON TABLE public.resume_submissions  TO anon, authenticated;

-- Drop existing policies safely so this script is idempotent
DROP POLICY IF EXISTS "Allow public contact form inserts" ON public.contact_submissions;
DROP POLICY IF EXISTS "Allow public resume form inserts"  ON public.resume_submissions;

-- Allow website visitors to submit contact enquiries (cannot SELECT/UPDATE/DELETE)
CREATE POLICY "Allow public contact form inserts"
  ON public.contact_submissions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow website visitors to submit career/resume enquiries (cannot SELECT/UPDATE/DELETE)
CREATE POLICY "Allow public resume form inserts"
  ON public.resume_submissions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (privacy_acknowledged = true);

-- -----------------------------------------------------------------------------
-- 4. PRIVATE STORAGE BUCKET FOR RESUMES + STORAGE POLICIES
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resumes',
  'resumes',
  false,
  10485760, -- 10 MB limit enforced server-side
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop existing storage policy safely so this script is idempotent
DROP POLICY IF EXISTS "Allow public resume uploads to private bucket" ON storage.objects;

-- Allow public visitors ONLY to upload (INSERT) PDF/DOC/DOCX files under applications/
-- No SELECT, UPDATE, or DELETE policy is granted to anon, keeping all resumes private.
CREATE POLICY "Allow public resume uploads to private bucket"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND name ~* '^applications/[0-9]{4}-[0-9]{2}/[^/]+\.(pdf|doc|docx)$'
  );

-- Ensure existing resume_submissions tables gain location & zip_code columns safely
ALTER TABLE public.resume_submissions ADD COLUMN IF NOT EXISTS zip_code TEXT;
ALTER TABLE public.resume_submissions ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.resume_submissions ALTER COLUMN preferred_staffing_area DROP NOT NULL;
ALTER TABLE public.resume_submissions ALTER COLUMN relevant_experience DROP NOT NULL;

-- Refresh PostgREST schema cache so new tables are available immediately via API
NOTIFY pgrst, 'reload schema';
