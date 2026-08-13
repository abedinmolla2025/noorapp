const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const record = payload?.record || payload;

    const name = String(record?.name || "Unknown");
    const email = String(record?.email || "No email provided");
    const subject = String(record?.subject || "General Inquiry");
    const message = String(record?.message || "");

    if (!message.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "missing_message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Missing RESEND_API_KEY environment variable");
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message);
    const preferredFrom = Deno.env.get("RESEND_FROM_EMAIL") || "";
    const fallbackFrom = "NoorApp <onboarding@resend.dev>";
    const isValidReplyEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px">
        <h2 style="color:#047857;border-bottom:2px solid #047857;padding-bottom:8px">New Contact Form Message - NoorApp</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <div style="margin-top:16px;padding:16px;background:#f8fafc;border-left:4px solid #047857;border-radius:4px">
          <p style="margin:0;white-space:pre-wrap">${safeMessage}</p>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#64748b">This message was sent from the NoorApp contact form. Reply directly to contact the sender.</p>
      </div>
    `;

    const sendEmail = async (from: string) => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: ["support@noorapp.in"],
          ...(isValidReplyEmail ? { reply_to: email } : {}),
          subject: `[Contact Us] ${subject} - from ${name}`,
          html: htmlContent,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`Resend API error: ${JSON.stringify(data)}`);
      }
      return data;
    };

    let data;
    if (preferredFrom) {
      try {
        data = await sendEmail(preferredFrom);
      } catch (preferredError) {
        console.warn("Configured sender failed; using Resend fallback sender.", preferredError);
        data = await sendEmail(fallbackFrom);
      }
    } else {
      data = await sendEmail(fallbackFrom);
    }

    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending contact email:", error);
    return new Response(JSON.stringify({ ok: false, error: "email_delivery_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
