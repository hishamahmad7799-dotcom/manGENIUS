/**
 * ManGENIUS Staffing LLC — Supabase Edge Function (Resend Email Notifications
 * + Secure 24-Hour Signed Resume Download Links & Authorized Link Regeneration)
 *
 * Server-Side Secrets & Built-In Environment Variables (NEVER exposed to frontend):
 *   - RESEND_API_KEY            Your Resend API key (re_...)
 *   - NOTIFICATION_TO_EMAIL     Your testing/admin recipient email address
 *   - NOTIFICATION_FROM_EMAIL   Optional; defaults to "ManGENIUS Staffing <onboarding@resend.dev>"
 *   - ADMIN_REGENERATE_SECRET   Optional dedicated secret for regenerating expired resume links
 *                               (falls back to server-side SUPABASE_SERVICE_ROLE_KEY)
 *   - SUPABASE_URL              Automatically injected by Supabase Edge Runtime
 *   - SUPABASE_SERVICE_ROLE_KEY Automatically injected by Supabase Edge Runtime
 *
 * Security Guarantees:
 *   - The "resumes" bucket remains strictly PRIVATE (public = false).
 *   - Signed URLs expire in 24 hours (86400 seconds) and are generated ONLY when
 *     sending notification emails.
 *   - Signed URLs are embedded ONLY in the email sent to NOTIFICATION_TO_EMAIL —
 *     NEVER returned in HTTP JSON responses.
 *   - Expired link regeneration (action: "regenerate_resume_link") requires server-side
 *     admin authentication (Bearer SUPABASE_SERVICE_ROLE_KEY or ADMIN_REGENERATE_SECRET)
 *     and sends a fresh 24-hour download link email to NOTIFICATION_TO_EMAIL.
 */

const DEFAULT_TESTING_FROM = 'ManGENIUS Staffing <onboarding@resend.dev>';
const RESUMES_BUCKET = 'resumes';
const SIGNED_URL_EXPIRY_SECONDS = 86400; // 24 hours
const SIGNED_URL_EXPIRY_LABEL = '24 hours';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESUME_PATH_REGEX = /^applications\/[0-9]{4}-[0-9]{2}\/[^/\\]+\.(pdf|doc|docx)$/i;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
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

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function isAuthorizedAdminRequest(req: Request): boolean {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
  const adminSecret = Deno.env.get('ADMIN_REGENERATE_SECRET')?.trim() || '';

  const authHeader = req.headers.get('authorization')?.trim() || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const headerSecret = req.headers.get('x-admin-secret')?.trim() || '';
  const candidate = headerSecret || bearerToken;

  if (!candidate) return false;
  if (adminSecret && timingSafeEqual(candidate, adminSecret)) return true;
  if (serviceRoleKey && timingSafeEqual(candidate, serviceRoleKey)) return true;
  return false;
}

interface SignedResumeResult {
  signedUrl: string | null;
  expiresAtUtc: string | null;
  verified: boolean;
  httpStatus: number | null;
  contentType: string | null;
  isMissingFile: boolean;
  error: string | null;
}

/**
 * Generates a 24-hour temporary signed download URL from the private "resumes" bucket
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
      expiresAtUtc: null,
      verified: false,
      httpStatus: 400,
      contentType: null,
      isMissingFile: false,
      error: 'Invalid resume storage path format.',
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/+$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      signedUrl: null,
      expiresAtUtc: null,
      verified: false,
      httpStatus: 500,
      contentType: null,
      isMissingFile: false,
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
      const isMissing =
        signResp.status === 404 ||
        /not found|no such/i.test(errMsg) ||
        String(signData?.statusCode || '') === '404';
      console.error('Supabase Storage sign error:', signResp.status, signData);
      return {
        signedUrl: null,
        expiresAtUtc: null,
        verified: false,
        httpStatus: isMissing ? 404 : signResp.status,
        contentType: null,
        isMissingFile: isMissing,
        error: isMissing ? 'Resume file was not found in private storage.' : errMsg,
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
    const expiresAtUtc = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toUTCString();

    // Verify that the signed URL is directly downloadable without auth headers
    let verified = false;
    let httpStatus: number | null = null;
    let contentType: string | null = null;
    let isMissingFile = false;
    let verifyError: string | null = null;

    try {
      const verifyResp = await fetch(downloadUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-31' },
      });
      httpStatus = verifyResp.status;
      contentType = verifyResp.headers.get('content-type');
      const chunk = new Uint8Array(await verifyResp.arrayBuffer());
      verified = (verifyResp.status === 200 || verifyResp.status === 206) && chunk.byteLength > 0;
      if (verifyResp.status === 404) {
        isMissingFile = true;
        verifyError = 'Resume file was not found in private storage.';
      } else if (!verified) {
        verifyError = `Signed URL verification returned HTTP ${verifyResp.status}.`;
      }
    } catch (verifyErr) {
      console.warn('Signed URL verification check failed:', verifyErr);
      verifyError = verifyErr instanceof Error ? verifyErr.message : 'Signed URL verification failed.';
    }

    return {
      signedUrl: downloadUrl,
      expiresAtUtc,
      verified,
      httpStatus,
      contentType,
      isMissingFile,
      error: verifyError,
    };
  } catch (err) {
    console.error('Unexpected error creating signed resume URL:', err);
    return {
      signedUrl: null,
      expiresAtUtc: null,
      verified: false,
      httpStatus: 500,
      contentType: null,
      isMissingFile: false,
      error: err instanceof Error ? err.message : 'Unexpected storage signing error.',
    };
  }
}

async function fetchResumeSubmissionRecord(
  submissionId: string,
  resumeFilePath: string,
): Promise<{ record: Record<string, unknown> | null; error: string | null; status: number }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/+$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return { record: null, error: 'Server-side Supabase credentials unavailable.', status: 500 };
  }

  let queryParam = '';
  if (submissionId) {
    if (!UUID_REGEX.test(submissionId)) {
      return { record: null, error: 'Invalid submission_id format (expected UUID).', status: 400 };
    }
    queryParam = `id=eq.${encodeURIComponent(submissionId)}`;
  } else if (resumeFilePath) {
    if (!RESUME_PATH_REGEX.test(resumeFilePath) || resumeFilePath.includes('..')) {
      return { record: null, error: 'Invalid resume_file_path format.', status: 400 };
    }
    queryParam = `resume_file_path=eq.${encodeURIComponent(resumeFilePath)}`;
  } else {
    return { record: null, error: 'Provide submission_id or resume_file_path to regenerate a link.', status: 400 };
  }

  const resp = await fetch(`${supabaseUrl}/rest/v1/resume_submissions?${queryParam}&select=*&limit=1`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      Accept: 'application/json',
    },
  });

  if (!resp.ok) {
    return { record: null, error: `Failed to query resume_submissions (HTTP ${resp.status}).`, status: 502 };
  }

  const rows = await resp.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) {
    return { record: null, error: 'Matching candidate submission not found.', status: 404 };
  }

  return { record: rows[0] as Record<string, unknown>, error: null, status: 200 };
}

function buildResumeEmailContent(
  rawData: Record<string, unknown>,
  signedResumeMeta: SignedResumeResult | null,
  isRegenerated: boolean,
): { subject: string; html: string; text: string } {
  const fullName = cleanText(rawData.full_name, 150);
  const email = cleanText(rawData.email, 254);
  const phone = cleanText(rawData.phone, 40);
  const message = cleanText(rawData.message, 5000);
  const sourcePage = cleanText(rawData.source_page, 100) || 'careers.html';
  const preferredArea = cleanText(rawData.preferred_staffing_area, 120);
  const relevantExperience = cleanText(rawData.relevant_experience, 500);
  const zipCode = cleanText(rawData.zip_code, 20);
  const location = cleanText(rawData.location, 200);
  const resumeFileName = cleanText(rawData.resume_file_name, 255) || 'candidate_resume.pdf';
  const resumeFilePath = cleanText(rawData.resume_file_path, 400);
  const resumeSize = formatFileSize(rawData.resume_file_size);
  const privacyAck = rawData.privacy_acknowledged ? 'Yes' : 'No';
  const futureOptIn = rawData.future_opportunities_opt_in ? 'Yes' : 'No';
  const submittedAt = rawData.created_at
    ? new Date(String(rawData.created_at)).toUTCString()
    : new Date().toUTCString();

  const safeSignedUrl = signedResumeMeta?.signedUrl ? escapeHtml(signedResumeMeta.signedUrl) : null;
  const expiryDetail = signedResumeMeta?.expiresAtUtc
    ? `${SIGNED_URL_EXPIRY_LABEL} (until ${escapeHtml(signedResumeMeta.expiresAtUtc)})`
    : SIGNED_URL_EXPIRY_LABEL;

  const downloadSectionHtml = safeSignedUrl
    ? `
      <div style="margin:22px 0;padding:18px 20px;background:#FFF7ED;border:1px solid #FDBA74;border-radius:6px;">
        <p style="margin:0 0 12px;font-size:14px;color:#111827;">
          <strong>${isRegenerated ? 'Fresh Resume Download Link (Private Storage):' : 'Candidate Resume Attached (Private Storage):'}</strong> ${escapeHtml(resumeFileName)} (${escapeHtml(resumeSize)})
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
          This secure temporary download link expires in <strong>${expiryDetail}</strong>. If the button does not work, copy and open this link:
          <br>
          <a href="${safeSignedUrl}" target="_blank" rel="noopener noreferrer" style="color:#FF6600;word-break:break-all;">Download ${escapeHtml(resumeFileName)}</a>
        </p>
      </div>
    `
    : `
      <div style="margin:20px 0;padding:14px 16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;font-size:13px;color:#991B1B;">
        <strong>Temporary download link unavailable:</strong> ${escapeHtml(
          signedResumeMeta?.isMissingFile
            ? 'The resume file could not be found in private storage.'
            : 'A temporary link could not be generated right now.',
        )} Please sign in to your Supabase Dashboard (&rarr; Storage &rarr; <code>resumes</code>) to verify or download <code>${escapeHtml(resumeFilePath || resumeFileName)}</code>.
      </div>
    `;

  const headingTitle = isRegenerated
    ? 'Regenerated Resume Download Link'
    : 'New Career &amp; Resume Submission';
  const subjectContext = location || preferredArea || 'Careers';
  const subject = isRegenerated
    ? `Fresh Resume Download Link (${subjectContext}) — ${fullName}`
    : `New Resume Submission (${subjectContext}) — ${fullName}`;

  const locationRowsHtml = [
    location
      ? `<tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Location:</td><td style="padding:8px 0;">${escapeHtml(location)}</td></tr>`
      : '',
    zipCode
      ? `<tr><td style="padding:8px 0;font-weight:bold;color:#374151;">ZIP Code:</td><td style="padding:8px 0;">${escapeHtml(zipCode)}</td></tr>`
      : '',
    !location && !zipCode && preferredArea
      ? `<tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Preferred Staffing Area:</td><td style="padding:8px 0;">${escapeHtml(preferredArea)}</td></tr>`
      : '',
    !location && !zipCode && relevantExperience
      ? `<tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Relevant Experience:</td><td style="padding:8px 0;">${escapeHtml(relevantExperience)}</td></tr>`
      : '',
  ].filter(Boolean).join('\n          ');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;line-height:1.6;">
      <div style="background:#111111;color:#FFFFFF;padding:20px 24px;border-bottom:4px solid #FF6600;">
        <h2 style="margin:0;font-size:20px;">${headingTitle}</h2>
        <p style="margin:4px 0 0;font-size:13px;color:#D1D5DB;">ManGENIUS Staffing LLC &bull; ${escapeHtml(sourcePage)}</p>
      </div>
      <div style="padding:24px;border:1px solid #E5E7EB;border-top:none;background:#FFFFFF;">
        ${downloadSectionHtml}
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;font-weight:bold;width:210px;color:#374151;">Full Name:</td><td style="padding:8px 0;">${escapeHtml(fullName)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Email Address:</td><td style="padding:8px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#FF6600;">${escapeHtml(email)}</a></td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;color:#374151;">Phone Number:</td><td style="padding:8px 0;">${escapeHtml(phone)}</td></tr>
          ${locationRowsHtml}
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
          Resumes remain stored in your private Supabase Storage bucket (<code>resumes</code>). If this link expires after ${SIGNED_URL_EXPIRY_LABEL}, you can download the file directly from your Supabase Dashboard or request a fresh 24-hour link via the authorized regeneration endpoint.
        </p>
      </div>
    </div>
  `;

  const text = [
    `${isRegenerated ? 'Regenerated Resume Download Link' : 'New Career & Resume Submission'} — ManGENIUS Staffing LLC`,
    `Source Page: ${sourcePage}`,
    `Submitted At (UTC): ${submittedAt}`,
    '',
    signedResumeMeta?.signedUrl
      ? `Download Resume (expires in ${SIGNED_URL_EXPIRY_LABEL}${signedResumeMeta.expiresAtUtc ? ` — until ${signedResumeMeta.expiresAtUtc}` : ''}): ${signedResumeMeta.signedUrl}`
      : 'Download Resume: Temporary link unavailable. Sign in to Supabase Dashboard -> Storage -> resumes.',
    '',
    `Full Name: ${fullName}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    ...(location ? [`Location: ${location}`] : []),
    ...(zipCode ? [`ZIP Code: ${zipCode}`] : []),
    ...(!location && !zipCode && preferredArea ? [`Preferred Staffing Area: ${preferredArea}`] : []),
    ...(!location && !zipCode && relevantExperience ? [`Relevant Experience: ${relevantExperience}`] : []),
    `Resume File: ${resumeFileName} (${resumeSize})`,
    `Private Storage Path: resumes/${resumeFilePath || 'Not provided'}`,
    `Privacy Acknowledged: ${privacyAck}`,
    `Future Opportunities Opt-In: ${futureOptIn}`,
    '',
    'Candidate Message:',
    message,
  ].join('\n');

  return { subject, html, text };
}

async function sendViaResend(params: {
  resendApiKey: string;
  fromEmail: string;
  toEmail: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true; id: string; deliveryStatus: string } | { ok: false; error: string; statusCode: number }> {
  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.fromEmail,
      to: [params.toEmail],
      reply_to: params.replyTo,
      subject: params.subject,
      html: params.html,
      text: params.text,
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
    return { ok: false, error: resendMessage, statusCode: resendResp.status };
  }

  const emailId = resendResult.id.trim();
  let deliveryStatus = 'accepted_by_resend';

  try {
    const statusResp = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${params.resendApiKey}`,
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

  return { ok: true, id: emailId, deliveryStatus };
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

    // 2. Parse incoming JSON payload
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ sent: false, error: 'Invalid JSON request body.' }, 400);
    }

    // 2A. Authorized regeneration flow for expired resume links
    // Generates a fresh 24-hour signed URL ONLY while emailing NOTIFICATION_TO_EMAIL
    if (body?.action === 'regenerate_resume_link' || body?.type === 'regenerate_resume_link') {
      if (!isAuthorizedAdminRequest(req)) {
        return jsonResponse(
          {
            sent: false,
            error: 'Unauthorized: regenerating an expired resume link requires server-side admin credentials.',
          },
          401,
        );
      }

      const submissionId = cleanText(body.submission_id, 64);
      const requestedPath = cleanText(body.resume_file_path, 400);

      const lookup = await fetchResumeSubmissionRecord(submissionId, requestedPath);
      if (!lookup.record) {
        return jsonResponse({ sent: false, error: lookup.error || 'Submission not found.' }, lookup.status);
      }

      const filePath = cleanText(lookup.record.resume_file_path, 400);
      const fileName = cleanText(lookup.record.resume_file_name, 255) || 'candidate_resume.pdf';
      const signedMeta = await createAndVerifySignedResumeUrl(filePath, fileName);

      if (!signedMeta.signedUrl || !signedMeta.verified) {
        return jsonResponse(
          {
            sent: false,
            signedUrlGenerated: Boolean(signedMeta.signedUrl),
            signedUrlVerified: Boolean(signedMeta.verified),
            error: signedMeta.isMissingFile
              ? 'Resume file is missing from private Supabase Storage and cannot be linked.'
              : signedMeta.error || 'Could not generate a verified signed resume link.',
          },
          signedMeta.isMissingFile ? 404 : 502,
        );
      }

      const emailContent = buildResumeEmailContent(lookup.record, signedMeta, true);
      const sendResult = await sendViaResend({
        resendApiKey: resendApiKey!,
        fromEmail,
        toEmail: toEmail!,
        replyTo: cleanText(lookup.record.email, 254),
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      if (!sendResult.ok) {
        return jsonResponse(
          { sent: false, provider: 'resend', error: sendResult.error, statusCode: sendResult.statusCode },
          502,
        );
      }

      return jsonResponse(
        {
          sent: true,
          regenerated: true,
          provider: 'resend',
          id: sendResult.id,
          from: fromEmail,
          deliveryStatus: sendResult.deliveryStatus,
          signedUrlGenerated: true,
          signedUrlVerified: true,
          signedUrlHttpStatus: signedMeta.httpStatus,
          signedUrlContentType: signedMeta.contentType,
          signedUrlExpiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
          signedUrlExpiresAtUtc: signedMeta.expiresAtUtc,
        },
        200,
      );
    }

    // 2B. Standard form submission flow (contact.html & careers.html)
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
      const resumeFileName = cleanText(rawData.resume_file_name, 255) || 'candidate_resume.pdf';
      const resumeFilePath = cleanText(rawData.resume_file_path, 400);

      // Generate secure 24-hour signed download URL server-side ONLY when sending notification email
      if (resumeFilePath) {
        signedResumeMeta = await createAndVerifySignedResumeUrl(resumeFilePath, resumeFileName);
      }

      const built = buildResumeEmailContent(rawData, signedResumeMeta, false);
      emailSubject = built.subject;
      htmlBody = built.html;
      textBody = built.text;
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
    const sendResult = await sendViaResend({
      resendApiKey: resendApiKey!,
      fromEmail,
      toEmail: toEmail!,
      replyTo: email,
      subject: emailSubject,
      html: htmlBody,
      text: textBody,
    });

    if (!sendResult.ok) {
      return jsonResponse(
        {
          sent: false,
          provider: 'resend',
          error: sendResult.error,
          statusCode: sendResult.statusCode,
        },
        502,
      );
    }

    // IMPORTANT: Never return the secret signedUrl to the public browser response.
    const responsePayload: Record<string, unknown> = {
      sent: true,
      provider: 'resend',
      id: sendResult.id,
      from: fromEmail,
      deliveryStatus: sendResult.deliveryStatus,
    };

    if (submissionType === 'resume') {
      responsePayload.signedUrlGenerated = Boolean(signedResumeMeta?.signedUrl);
      responsePayload.signedUrlVerified = Boolean(signedResumeMeta?.verified);
      responsePayload.signedUrlHttpStatus = signedResumeMeta?.httpStatus ?? null;
      responsePayload.signedUrlContentType = signedResumeMeta?.contentType ?? null;
      responsePayload.signedUrlExpiresInSeconds = SIGNED_URL_EXPIRY_SECONDS;
      responsePayload.signedUrlExpiresAtUtc = signedResumeMeta?.expiresAtUtc ?? null;
      responsePayload.resumeMissing = Boolean(signedResumeMeta?.isMissingFile);
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
