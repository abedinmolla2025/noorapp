export const config = {
  runtime: 'edge',
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

export default async function handler(req: Request) {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    const body = await req.json();
    const { name, email, subject, message, page, issueType } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400, headers });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers });
    }

    const safeName = escapeHtml(name || 'Anonymous');
    const safeEmail = escapeHtml(email || 'Not provided');
    const safeSubject = escapeHtml(subject || 'General Inquiry');
    const safeMessage = escapeHtml(message);
    const safePage = escapeHtml(page || 'Unknown');
    const safeIssue = escapeHtml(issueType || 'general');

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px">
        <h2 style="color: #047857; border-bottom: 2px solid #047857; padding-bottom: 8px">New Support Ticket - NoorApp</h2>
        <p><strong>From:</strong> ${safeName} (${safeEmail})</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <p><strong>Page:</strong> ${safePage}</p>
        <p><strong>Issue Category:</strong> ${safeIssue}</p>
        <div style="margin-top: 16px; padding: 16px; background: #f8fafc; border-left: 4px solid #047857; border-radius: 4px">
          <p style="margin: 0; white-space: pre-wrap">${safeMessage}</p>
        </div>
        <p style="margin-top: 24px; font-size: 12px; color: #64748b">
          You can reply directly to this email to respond to the user.
        </p>
      </div>
    `;

    const isValidReplyEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email || "");

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'NoorApp Support <support@noorapp.in>',
        to: ['support@noorapp.in'],
        reply_to: isValidReplyEmail ? email : undefined,
        subject: `[Support] ${safeSubject} - from ${safeName}`,
        html: html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend Error:', resendData);
      return new Response(JSON.stringify({ error: resendData.message || 'Failed to send email' }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ success: true, id: resendData.id }), { status: 200, headers });
  } catch (err: any) {
    console.error('API Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
