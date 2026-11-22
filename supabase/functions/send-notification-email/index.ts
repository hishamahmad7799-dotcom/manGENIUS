/**
 * ManGENIUS Staffing LLC — Supabase Edge Function (Resend Email Preparation)
 *
 * Deploy via Supabase CLI:
 *   supabase functions deploy send-notification-email --no-verify-jwt
 *
 * Configure secrets in Supabase Dashboard -> Edge Functions -> Secrets (or CLI):
 *   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
 *   supabase secrets set NOTIFICATION_TO_EMAIL=info@mangeniusstaffing.com
 *   supabase secrets set NOTIFICATION_FROM_EMAIL="ManGENIUS Staffing <notifications@yourdomain.com>"
 *
 * SECURITY:
 * - RESEND_API_KEY lives ONLY in Supabase Edge Function Secrets — never in frontend JS.
 * - After deploying and setting secrets, set `enableEmailNotifications: true` in
 *   `client-website/js/supabase-config.js`.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const toEmail = Deno.env.get('NOTIFICATION_TO_EMAIL');
    const fromEmail = Deno.env.get('NOTIFICATION_FROM_EMAIL');

    if (!resendApiKey || !toEmail || !fromEmail) {
      return new Response(
        JSON.stringify({
          sent: false,
          message: 'Resend secrets are not configured yet on this Edge Function.'
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const body = await req.json();
    // Supports both Supabase Database Webhooks ({ type: 'INSERT', table, record })
    // and direct supabase.functions.invoke({ body: { type, data } }) calls.
    const isDbWebhook = body?.type === 'INSERT' && body?.record && typeof body?.table === 'string';
    const submissionType = isDbWebhook
      ? (body.table === 'resume_submissions' ? 'resume' : 'contact')
      : (body?.type === 'resume' ? 'resume' : 'contact');
    const data = isDbWebhook ? body.record : (body?.data ?? {});

    const emailSubject =
      submissionType === 'resume'
        ? `New Resume Submission (${escapeHtml(data.preferred_staffing_area)}) — ${escapeHtml(data.full_name)}`
        : `New Contact Enquiry (${escapeHtml(data.subject)}) — ${escapeHtml(data.full_name)}`;

    const htmlBody =
      submissionType === 'resume'
        ? `
          <h2>New Candidate Resume Submission — ManGENIUS Staffing LLC</h2>
          <p><strong>Full Name:</strong> ${escapeHtml(data.full_name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(data.phone)}</p>
          <p><strong>Preferred Staffing Area:</strong> ${escapeHtml(data.preferred_staffing_area)}</p>
          <p><strong>Relevant Experience:</strong> ${escapeHtml(data.relevant_experience)}</p>
          <p><strong>Future Opportunities Opt-In:</strong> ${data.future_opportunities_opt_in ? 'Yes' : 'No'}</p>
          <p><strong>Private Resume Path:</strong> <code>resumes/${escapeHtml(data.resume_file_path)}</code></p>
          <p><strong>Message:</strong><br>${escapeHtml(data.message).replace(/\n/g, '<br>')}</p>
          <hr>
          <p style="font-size:12px;color:#666;">Review the candidate record and download the private resume from the Supabase Dashboard.</p>
        `
        : `
          <h2>New Contact Enquiry — ManGENIUS Staffing LLC</h2>
          <p><strong>Full Name:</strong> ${escapeHtml(data.full_name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(data.phone)}</p>
          <p><strong>Organization:</strong> ${escapeHtml(data.organization_name || 'Not provided')}</p>
          <p><strong>Contacting As:</strong> ${escapeHtml(data.contacting_as)}</p>
          <p><strong>Subject / Service:</strong> ${escapeHtml(data.subject)}</p>
          <p><strong>Message:</strong><br>${escapeHtml(data.message).replace(/\n/g, '<br>')}</p>
        `;

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: typeof data.email === 'string' ? data.email : undefined,
        subject: emailSubject,
        html: htmlBody
      })
    });

    const resendResult = await resendResp.json();

    if (!resendResp.ok) {
      return new Response(
        JSON.stringify({ sent: false, error: resendResult }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({ sent: true, id: resendResult.id }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ sent: false, error: err instanceof Error ? err.message : 'Unexpected error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
