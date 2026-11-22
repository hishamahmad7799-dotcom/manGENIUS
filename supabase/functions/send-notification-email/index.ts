/**
 * ManGENIUS Staffing LLC — Supabase Edge Function (Resend Email Notifications
 * + Secure 1-Hour Signed Resume Download Links)
 *
 * Server-Side Secrets & Built-In Environment Variables (NEVER exposed to frontend):
 *   - RESEND_API_KEY            Your Resend API key (re_...)
 *   - NOTIFICATION_TO_EMAIL     Your testing/admin recipient email address
 *   - NOTIFICATION_FROM_EMAIL   Optional; defaults to "ManGENIUS Staffing <onboarding@resend.dev>"
 *   - SUPABASE_URL              Automatically injected by Supabase Edge Runtime
 *   - SUPABASE_SERVICE_ROLE_KEY Automatically injected by Supabase Edge Runtime
 *                               (used ONLY server-side to sign private "resumes" downloads)
 *
 * Security Guarantees:
 *   - The "resumes" bucket remains strictly PRIVATE (public = false).
 *   - Signed URLs expire in 1 hour (3600 seconds).
 *   - Signed URLs are embedded ONLY in the email sent to NOTIFICATION_TO_EMAIL —
 *     NEVER returned in the HTTP JSON response to public website callers.
 */

const DEFAULT_TESTING_FROM = 'ManGENIUS Staffing <onboarding@resend.dev>';
const RESUMES_BUCKET = 'resumes';
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESUME_PATH_REGEX = /^applications\/[0-9]{4}-[0-9]{2}\/[^/\\]+\.(pdf|doc|docx)$/i;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function formatFileSize(bytes: unknown): string {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num <= 0) return 'Not provided';
  if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(num / 1024))} KB`;
}

function sanitizeDownloadFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').slice(0, 120);
  return cleaned || 'candidate_resume.pdf';
}

interface SignedResumeResult {
  signedUrl: string | null;
  verified: boolean;
  httpStatus: number | null;
  contentType: string | null;
  error: string | null;
}

/**
 * Generates a 1-hour temporary signed download URL from the private "resumes" bucket
 * using server-side SUPABASE_SERVICE_ROLE_KEY, then verifies via an unauthenticated
 * range GET that an email recipient clicking the link can download the file.
 */
async function createAndVerifySignedResumeUrl(
  resumeFilePath: string,
  downloadFileName: string,
): Promise<SignedResumeResult> {
  if (!RESUME_PATH_REGEX.test(resumeFilePath) || resumeFilePath.includes('..')) {
    return {
      signedUrl: null,
      verified: false,
      httpStatus: null,
      contentType: null,
      error: 'Invalid resume storage path format.',
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/+$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      signedUrl: null,
      verified: false,
      httpStatus: null,
      contentType: null,
      error: 'Server-side SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is unavailable.',
    };
  }

  const encodedPath = resumeFilePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const signEndpoint = `${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(RESUMES_BUCKET)}/${encodedPath}`;

  try {
    const signResp = await fetch(signEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: SIGNED_URL_EXPIRY_SECONDS }),
    });

    const signData = await signResp.json().catch(() => ({}));
    const rawSignedPath =
      typeof signData?.signedURL === 'string'
        ? signData.signedURL
        : typeof signData?.signedUrl === 'string'
          ? signData.signedUrl
          : '';

    if (!signResp.ok || !rawSignedPath) {
      const errMsg =
        typeof signData?.message === 'string'
          ? signData.message
          : typeof signData?.error === 'string'
            ? signData.error
            : `Storage sign endpoint returned HTTP ${signResp.status}`;
      console.error('Supabase Storage sign error:', signResp.status, signData);
      return {
        signedUrl: null,
        verified: false,
        httpStatus: signResp.status,
        contentType: null,
        error: errMsg,
      };
    }

    let fullSignedUrl: string;
    if (/^https?:\/\//i.test(rawSignedPath)) {
      fullSignedUrl = rawSignedPath;
    } else if (rawSignedPath.startsWith('/storage/v1/')) {
      fullSignedUrl = `${supabaseUrl}${rawSignedPath}`;
    } else if (rawSignedPath.startsWith('/')) {
      fullSignedUrl = `${supabaseUrl}/storage/v1${rawSignedPath}`;
    } else {
      fullSignedUrl = `${supabaseUrl}/storage/v1/${rawSignedPath}`;
    }

    const safeName = sanitizeDownloadFilename(downloadFileName);
    const separator = fullSignedUrl.includes('?') ? '&' : '?';
    const downloadUrl = `${fullSignedUrl}${separator}download=${encodeURIComponent(safeName)}`;

    // Verify that the signed URL is directly downloadable without auth headers
    let verified = false;
    let httpStatus: number | null = null;
    let contentType: string | null = null;

    try {
      const verifyResp = await fetch(downloadUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-31' },
      });
      httpStatus = verifyResp.status;
      contentType = verifyResp.headers.get('content-type');
      const chunk = new Uint8Array(await verifyResp.arrayBuffer());
      verified = (verifyResp.status === 200 || verifyResp.status === 206) && chunk.byteLength > 0;
    } catch (verifyErr) {
      console.warn('Signed URL verification check failed:', verifyErr);
    }

    return {
      signedUrl: downloadUrl,
      verified,
      httpStatus,
      contentType,
      error: null,
    };
  } catch (err) {
    console.error('Unexpected error creating signed resume URL:', err);
    return {
      signedUrl: null,
      verified: false,
      httpStatus: null,
      contentType: null,
      error: err instanceof Error ? err.message : 'Unexpected storage signing error.',
    };
  }
}

Deno.serve(async (req: Request) => {
  // Handle browser CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ sent: false, error: 'Method not allowed. Use POST.' }, 405);
  }

  try {
    // 1. Read secrets strictly from server-side environment
    const resendApiKey = Deno.env.get('RESEND_API_KEY')?.trim();
    const toEmail =
      Deno.env.get('NOTIFICATION_TO_EMAIL')?.trim() ||
      Deno.env.get('RESEND_TO_EMAIL')?.trim() ||
      Deno.env.get('TEST_EMAIL')?.trim();
    const fromEmail = Deno.env.get('NOTIFICATION_FROM_EMAIL')?.trim() || DEFAULT_TESTING_FROM;

    const missingSecrets: string[] = [];
    if (!resendApiKey) missingSecrets.push('RESEND_API_KEY');
    if (!toEmail) missingSecrets.push('NOTIFICATION_TO_EMAIL');

    if (missingSecrets.length > 0) {
      return jsonResponse(
        {
          sent: false,
          error: `Missing Supabase Edge Function secret(s): ${missingSecrets.join(', ')}.`,
        },
        503,
      );
    }

    // 2. Parse & validate incoming JSON payload
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ sent: false, error: 'Invalid JSON request body.' }, 400);
    }

    const isDbWebhook =
      body?.type === 'INSERT' &&
      typeof body?.table === 'string' &&
      typeof body?.record === 'object' &&
      body?.record !== null;

    const submissionType: 'contact' | 'resume' = isDbWebhook
      ? body.table === 'resume_submissions'
        ? 'resume'
        : 'contact'
      : body?.type === 'resume'
        ? 'resume'
        : 'contact';

    const rawData = (isDbWebhook ? body.record : body?.data) as Record<string, unknown> | undefined;
    if (!rawData || typeof rawData !== 'object') {
      return jsonResponse({ sent: false, error: 'Missing submission data payload.' }, 400);
    }

    const fullName = cleanText(rawData.full_name, 150);
    const email = cleanText(rawData.email, 254);
    const phone = cleanText(rawData.phone, 40);
    const message = cleanText(rawData.message, 5000);
    const sourcePage = cleanText(rawData.source_page, 100) || (submissionType === 'resume' ? 'careers.html' : 'contact.html');
    const submittedAt = new Date().toUTCString();

    if (fullName.length < 2) {
      return jsonResponse({ sent: false, error: 'Validation failed: full_name is required.' }, 400);
    }
    if (!EMAIL_REGEX.test(email)) {
      return jsonResponse({ sent: false, error: 'Validation failed: valid email is required.' }, 400);
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      return jsonResponse({ sent: false, error: 'Validation failed: valid phone is required.' }, 400);
    }
    if (message.length < 10) {
      return jsonResponse({ sent: false, error: 'Validation failed: message must be at least 10 characters.' }, 400);
    }

    // 3. Build notification subject, HTML body, and plain-text body
    let emailSubject: string;
    let htmlBody: string;
    let textBody: string;
    let signedResumeMeta: SignedResumeResult | null = null;

    if (submissionType === 'resume') {
      const preferredArea = cleanText(rawData.preferred_staffing_area, 120) || 'Not specified';
      const relevantExperience = cleanText(rawData.relevant_experience, 500) || 'Not specified';
      const resumeFileName = cleanText(rawData.resume_file_name, 255) || 'candidate_resume.pdf';
      const resumeFilePath = cleanText(rawData.resume_file_path, 400);
      const resumeSize = formatFileSize(rawData.resume_file_size);
      const privacyAck = rawData.privacy_acknowledged ? 'Yes' : 'No';
      const futureOptIn = rawData.future_opportunities_opt_in ? 'Yes' : 'No';

      // Generate secure 1-hour signed download URL server-side from private "resumes" bucket
      if (resumeFilePath) {
        signedResumeMeta = await createAndVerifySignedResumeUrl(resumeFilePath, resumeFileName);
      }

      const safeSignedUrl = signedResumeMeta?.signedUrl ? escapeHtml(signedResumeMeta.signedUrl) : null;

      const downloadSectionHtml = safeSignedUrl
        ? `
          <div style="margin:22px 0;padding:18px 20px;background:#FFF7ED;border:1px solid #FDBA74;border-radius:6px;">
            <p style="margin:0 0 12px;font-size:14px;color:#111827;">
              <strong>Candidate Resume Attached (Private Storage):</strong> ${escapeHtml(resumeFileName)} (${escapeHtml(resumeSize)})
            </p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="border-radius:6px;background:#FF6600;">
                  <a href="${safeSignedUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:6px;">
                    Download Resume
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0;font-size:12px;color:#6B7280;">
              This secure temporary download link expires in <strong>1 hour</strong>. If the button does not work, copy and open this link:
              <br>
              <a href="${safeSignedUrl}" target="_blank" rel="noopener noreferrer" style="color:#FF6600;word-break:break-all;">Download ${escapeHtml(resumeFileName)}</a>
            </p>
          </div>
        `
        : `
          <div style="margin:20px 0;padding:14px 16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;font-size:13px;color:#991B1B;">
            <strong>Temporary download link unavailable:</strong> Please log in to your Supabase Dashboard (&rarr; Storage &rarr; <code>resumes</code>) to download <code>${escapeHtml(resumeFilePath || resumeFileName)}</code>.
          </div>
        `;

      emailSubject = `New Resume Submission (${preferredArea}) — ${fullName}`;
      htmlBody = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;line-height:1.6;">
          <div style="background:#111111;color:#FFFFFF;padding:20px 24px;border-bottom:4px solid #FF6600;">
            <h2 style="margin:0;font-size:20px;">New Career &amp; Resume Submission</h2>
            <p style="margin:4px 0 0;font-size:13px;color:#D1D5DB;">ManGENIUS Staffing LLC &bull; ${escapeHtml(sourcePage)}</p>
          </div>
          <div style="padding:24px;border:1px solid #E5E7EB;border-top:none;background:#FFFFFF;">
            ${downloadSectionHtml}
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px 0;font-weight:bold;width:210px;color:#374151;">Full Name:</td><td style="padding:8px 0;">${escapeHtml(fullName)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Email Address:</td><td style="padding:8px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#FF6600;">${escapeHtml(email)}</a></td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Phone Number:</td><td style="padding:8px 0;">${escapeHtml(phone)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Preferred Staffing Area:</td><td style="padding:8px 0;">${escapeHtml(preferredArea)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Relevant Experience:</td><td style="padding:8px 0;">${escapeHtml(relevantExperience)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Resume File:</td><td style="padding:8px 0;">${escapeHtml(resumeFileName)} (${escapeHtml(resumeSize)})</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Private Storage Path:</td><td style="padding:8px 0;"><code>resumes/${escapeHtml(resumeFilePath || 'Not provided')}</code></td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Privacy Acknowledged:</td><td style="padding:8px 0;">${privacyAck}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Future Opportunities Opt-In:</td><td style="padding:8px 0;">${futureOptIn}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Submitted At (UTC):</td><td style="padding:8px 0;">${escapeHtml(submittedAt)}</td></tr>
            </table>
            <div style="margin-top:18px;padding:14px 16px;background:#F9FAFB;border-left:4px solid #FF6600;">
              <strong style="display:block;margin-bottom:6px;color:#111827;">Candidate Message</strong>
              <div>${escapeHtml(message).replace(/\n/g, '<br>')}</div>
            </div>
            <p style="margin-top:20px;font-size:12px;color:#6B7280;">
              Resumes remain stored in your private Supabase Storage bucket (<code>resumes</code>). After the 1-hour link expires, sign in to your Supabase Dashboard to view or download the file.
            </p>
          </div>
        </div>
      `;

      textBody = [
        'New Career & Resume Submission — ManGENIUS Staffing LLC',
        `Source Page: ${sourcePage}`,
        `Submitted At (UTC): ${submittedAt}`,
        '',
        signedResumeMeta?.signedUrl
          ? `Download Resume (expires in 1 hour): ${signedResumeMeta.signedUrl}`
          : 'Download Resume: Sign in to Supabase Dashboard -> Storage -> resumes',
        '',
        `Full Name: ${fullName}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        `Preferred Staffing Area: ${preferredArea}`,
        `Relevant Experience: ${relevantExperience}`,
        `Resume File: ${resumeFileName} (${resumeSize})`,
        `Private Storage Path: resumes/${resumeFilePath || 'Not provided'}`,
        `Privacy Acknowledged: ${privacyAck}`,
        `Future Opportunities Opt-In: ${futureOptIn}`,
        '',
        'Candidate Message:',
        message,
      ].join('\n');
    } else {
      const organization = cleanText(rawData.organization_name, 200) || 'Not provided';
      const contactingAs = cleanText(rawData.contacting_as, 100) || 'Not specified';
      const subject = cleanText(rawData.subject, 150) || 'General Enquiry';

      emailSubject = `New Contact Enquiry (${subject}) — ${fullName}`;
      htmlBody = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;line-height:1.6;">
          <div style="background:#111111;color:#FFFFFF;padding:20px 24px;border-bottom:4px solid #FF6600;">
            <h2 style="margin:0;font-size:20px;">New Website Contact Enquiry</h2>
            <p style="margin:4px 0 0;font-size:13px;color:#D1D5DB;">ManGENIUS Staffing LLC &bull; ${escapeHtml(sourcePage)}</p>
          </div>
          <div style="padding:24px;border:1px solid #E5E7EB;border-top:none;background:#FFFFFF;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px 0;font-weight:bold;width:190px;color:#374151;">Full Name:</td><td style="padding:8px 0;">${escapeHtml(fullName)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Email Address:</td><td style="padding:8px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#FF6600;">${escapeHtml(email)}</a></td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Phone Number:</td><td style="padding:8px 0;">${escapeHtml(phone)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Organization:</td><td style="padding:8px 0;">${escapeHtml(organization)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Contacting As:</td><td style="padding:8px 0;">${escapeHtml(contactingAs)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Subject / Service:</td><td style="padding:8px 0;">${escapeHtml(subject)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Submitted At (UTC):</td><td style="padding:8px 0;">${escapeHtml(submittedAt)}</td></tr>
            </table>
            <div style="margin-top:18px;padding:14px 16px;background:#F9FAFB;border-left:4px solid #FF6600;">
              <strong style="display:block;margin-bottom:6px;color:#111827;">Message</strong>
              <div>${escapeHtml(message).replace(/\n/g, '<br>')}</div>
            </div>
            <p style="margin-top:20px;font-size:12px;color:#6B7280;">
              Reply directly to this email to respond to ${escapeHtml(fullName)} (${escapeHtml(email)}).
            </p>
          </div>
        </div>
      `;

      textBody = [
        'New Website Contact Enquiry — ManGENIUS Staffing LLC',
        `Source Page: ${sourcePage}`,
        `Submitted At (UTC): ${submittedAt}`,
        '',
        `Full Name: ${fullName}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        `Organization: ${organization}`,
        `Contacting As: ${contactingAs}`,
        `Subject / Service: ${subject}`,
        '',
        'Message:',
        message,
      ].join('\n');
    }

    // 4. Send email via Resend REST API (server-side only)
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: email,
        subject: emailSubject,
        html: htmlBody,
        text: textBody,
      }),
    });

    const resendResult = await resendResp.json().catch(() => ({}));

    if (!resendResp.ok || typeof resendResult?.id !== 'string' || !resendResult.id.trim()) {
      const resendMessage =
        typeof resendResult?.message === 'string'
          ? resendResult.message
          : !resendResp.ok
            ? `Resend API returned HTTP ${resendResp.status}`
            : 'Resend did not return a message ID.';
      console.error('Resend API error:', resendResp.status, resendResult);
      return jsonResponse(
        {
          sent: false,
          provider: 'resend',
          error: resendMessage,
          statusCode: resendResp.status,
        },
        502,
      );
    }

    const emailId = resendResult.id.trim();

    // 5. Query Resend for current delivery event (non-fatal if sending-only key)
    let deliveryStatus = 'accepted_by_resend';
    try {
      const statusResp = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
        },
      });
      if (statusResp.ok) {
        const statusData = await statusResp.json().catch(() => ({}));
        if (typeof statusData?.last_event === 'string' && statusData.last_event.trim()) {
          deliveryStatus = statusData.last_event.trim();
        }
      }
    } catch {
      // Non-fatal
    }

    // IMPORTANT: Never return the secret signedUrl to the public browser response.
    // Only return safe verification metadata.
    const responsePayload: Record<string, unknown> = {
      sent: true,
      provider: 'resend',
      id: emailId,
      from: fromEmail,
      deliveryStatus,
    };

    if (submissionType === 'resume') {
      responsePayload.signedUrlGenerated = Boolean(signedResumeMeta?.signedUrl);
      responsePayload.signedUrlVerified = Boolean(signedResumeMeta?.verified);
      responsePayload.signedUrlHttpStatus = signedResumeMeta?.httpStatus ?? null;
      responsePayload.signedUrlContentType = signedResumeMeta?.contentType ?? null;
      responsePayload.signedUrlExpiresInSeconds = SIGNED_URL_EXPIRY_SECONDS;
      if (signedResumeMeta?.error) {
        responsePayload.signedUrlError = signedResumeMeta.error;
      }
    }

    return jsonResponse(responsePayload, 200);
  } catch (err) {
    console.error('Unexpected Edge Function error:', err);
    return jsonResponse(
      {
        sent: false,
        error: err instanceof Error ? err.message : 'Unexpected server error.',
      },
      500,
    );
  }
});
