export const config = {
  runtime: 'edge',
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SUPPORT_EMAIL = "support@noorapp.in";
const SUPPORT_FROM = "NoorApp Support <support@noorapp.in>";

const sendResendEmail = async (apiKey: string, payload: Record<string, unknown>) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data: { id?: string; message?: string } = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.message || "Failed to send email");
  }

  return data;
};

const shell = (content: string) => `
  <div style="margin:0;background:#f8fafc;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#0f172a">
    <div style="max-width:620px;margin:0 auto">
      <div style="overflow:hidden;border:1px solid #e5e7eb;border-radius:20px;background:#ffffff;box-shadow:0 8px 30px rgba(0,0,0,.06)">
        <div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:28px 32px;color:#ffffff">
          <div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.82">NOORAPP SUPPORT</div>
          <div style="margin-top:8px;font-size:24px;font-weight:700;line-height:1.25">Here to help, with care.</div>
        </div>
        ${content}
      </div>
      <p style="margin:20px 0 0;text-align:center;font-size:12px;line-height:1.6;color:#94a3b8">
        NoorApp · Trusted Islamic tools for everyday life
      </p>
    </div>
  </div>
`;

export default async function handler(req: Request) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  try {
    const body = await req.json();
    const {
      name,
      email,
      subject,
      message,
      page,
      issueType,
      attachmentUrl,
    } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), { status: 400, headers });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers });
    }

    const rawName = String(name || "Anonymous Visitor").trim() || "Anonymous Visitor";
    const rawEmail = String(email || "").trim();
    const rawSubject = String(subject || "General Inquiry").trim() || "General Inquiry";
    const rawPage = String(page || "Unknown").trim() || "Unknown";
    const rawIssue = String(issueType || "General Question").trim() || "General Question";
    const rawMessage = String(message);
    const rawAttachmentUrl = String(attachmentUrl || "").trim();
    const isValidReplyEmail = EMAIL_PATTERN.test(rawEmail);
    const ticketReference = `NOOR-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

    const safeName = escapeHtml(rawName);
    const safeEmail = escapeHtml(rawEmail || "Not provided");
    const safeSubject = escapeHtml(rawSubject);
    const safeMessage = escapeHtml(rawMessage);
    const safePage = escapeHtml(rawPage);
    const safeIssue = escapeHtml(rawIssue);
    const safeAttachmentUrl = escapeHtml(rawAttachmentUrl);
    const safeTicketReference = escapeHtml(ticketReference);

    const adminHtml = shell(`
      <div style="padding:32px">
        <div style="display:inline-block;border-radius:999px;background:#ecfdf5;padding:7px 12px;color:#15803d;font-size:12px;font-weight:700">NEW SUPPORT TICKET</div>
        <h1 style="margin:18px 0 8px;font-size:24px;line-height:1.3;color:#0f172a">${safeSubject}</h1>
        <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6">Reference: <strong style="color:#15803d">${safeTicketReference}</strong></p>

        <div style="margin-top:24px;border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;padding:16px">
          <p style="margin:0 0 8px;font-size:13px;color:#64748b"><strong style="color:#334155">From:</strong> ${safeName} ${isValidReplyEmail ? `&lt;${safeEmail}&gt;` : ""}</p>
          <p style="margin:0 0 8px;font-size:13px;color:#64748b"><strong style="color:#334155">Page:</strong> ${safePage}</p>
          <p style="margin:0;font-size:13px;color:#64748b"><strong style="color:#334155">Issue category:</strong> ${safeIssue}</p>
        </div>

        <div style="margin-top:18px;border-left:4px solid #16a34a;border-radius:10px;background:#f8fafc;padding:16px">
          <p style="margin:0;white-space:pre-wrap;font-size:14px;line-height:1.75;color:#334155">${safeMessage}</p>
        </div>
        ${safeAttachmentUrl ? `<p style="margin:20px 0 0"><a href="${safeAttachmentUrl}" style="display:inline-block;border-radius:10px;background:#ecfdf5;padding:11px 15px;color:#15803d;font-size:13px;font-weight:700;text-decoration:none">View screenshot attachment</a></p>` : ""}
        <p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#94a3b8">Reply directly to this email to respond to the visitor.</p>
      </div>
    `);

    const adminEmail = await sendResendEmail(resendApiKey, {
      from: SUPPORT_FROM,
      to: [SUPPORT_EMAIL],
      reply_to: isValidReplyEmail ? rawEmail : undefined,
      subject: `[Support] ${rawSubject} · ${ticketReference}`,
      html: adminHtml,
    });

    let confirmationSent = false;
    if (isValidReplyEmail) {
      const confirmationHtml = shell(`
        <div style="padding:32px">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="display:inline-flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:50%;background:#ecfdf5;color:#15803d;font-size:22px">✓</div>
            <div>
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#15803d">Message received</p>
              <h1 style="margin:5px 0 0;font-size:24px;line-height:1.3;color:#0f172a">Thank you, ${safeName}.</h1>
            </div>
          </div>

          <p style="margin:26px 0 0;font-size:15px;line-height:1.8;color:#475569">
            We’ve received your feedback and it is now with the NoorApp support team. We’ll review it carefully and get back to you as soon as possible.
          </p>

          <div style="margin-top:24px;border:1px solid #dcfce7;border-radius:14px;background:#f0fdf4;padding:18px">
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#15803d">Ticket details</p>
            <p style="margin:12px 0 5px;font-size:14px;color:#475569"><strong style="color:#166534">Reference:</strong> ${safeTicketReference}</p>
            <p style="margin:0;font-size:14px;color:#475569"><strong style="color:#166534">Subject:</strong> ${safeSubject}</p>
          </div>

          <p style="margin:24px 0 0;font-size:14px;line-height:1.75;color:#64748b">
            Our usual response time is <strong style="color:#334155">24–48 hours</strong>. If you have additional information, simply reply to this email and include your reference number.
          </p>
          ${safeAttachmentUrl ? `<p style="margin:20px 0 0"><a href="${safeAttachmentUrl}" style="display:inline-block;border-radius:10px;background:#ecfdf5;padding:11px 15px;color:#15803d;font-size:13px;font-weight:700;text-decoration:none">View your submitted screenshot</a></p>` : ""}
          <div style="margin-top:28px;border-top:1px solid #e5e7eb;padding-top:20px">
            <p style="margin:0;font-size:13px;line-height:1.7;color:#94a3b8">This is an automatic confirmation—no action is required right now. Thank you for helping us improve NoorApp.</p>
          </div>
        </div>
      `);

      try {
        await sendResendEmail(resendApiKey, {
          from: SUPPORT_FROM,
          to: [rawEmail],
          reply_to: SUPPORT_EMAIL,
          subject: `We received your NoorApp support request · ${ticketReference}`,
          html: confirmationHtml,
        });
        confirmationSent = true;
      } catch (confirmationError) {
        // The support inbox email has already been delivered; do not fail the ticket because a confirmation bounced.
        console.error("Auto-response error:", confirmationError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      id: adminEmail.id,
      ticketReference,
      confirmationSent,
    }), { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    console.error("API Error:", err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
}
