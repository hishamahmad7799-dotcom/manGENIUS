/**
 * ManGENIUS Staffing LLC — Supabase Client Configuration
 *
 * Uses the official @supabase/supabase-js v2 CDN build loaded before this file.
 * SECURITY NOTE:
 * - Only the public Project URL and Publishable Key belong in frontend code.
 * - NEVER place service_role keys, database passwords, or Resend API keys here.
 * - Row Level Security (RLS) and Storage policies in supabase/schema.sql enforce
 *   write-only public submissions and keep uploaded resumes strictly private.
 */
(function () {
  'use strict';

  const SUPABASE_CONFIG = {
    // Base Supabase Project URL (without /rest/v1/ — the JS client appends API paths automatically)
    url: 'https://mrtappsdecgbqpejowmz.supabase.co',

    // Public Publishable Key (safe for browser use with RLS enabled)
    publishableKey: 'sb_publishable_r0fBePg2WQUdg4V-CzTJFQ_BjsAtfCd',

    // Private Supabase Storage bucket for candidate resumes
    resumesBucket: 'resumes',

    // Maximum allowed resume size in MB (must match bucket file_size_limit in Supabase)
    maxResumeSizeMB: 10,

    // Optional Supabase Edge Function name prepared for Resend email notifications
    // Set enableEmailNotifications to true after deploying the Edge Function and setting RESEND_API_KEY
    emailEdgeFunction: 'send-notification-email',
    enableEmailNotifications: false
  };

  window.MANGENIUS_SUPABASE_CONFIG = SUPABASE_CONFIG;

  if (window.supabase && typeof window.supabase.createClient === 'function') {
    window.mangeniusSupabase = window.supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.publishableKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );
  } else {
    window.mangeniusSupabase = null;
    console.error('Supabase JS CDN library failed to load before supabase-config.js.');
  }
})();
