import createLogger from "./logger.js";

const log = createLogger("email");

const RESEND_API_URL = "https://api.resend.com/emails";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.error("RESEND_API_KEY not configured");
    return { success: false, error: "Email service not configured. Set RESEND_API_KEY." };
  }

  const fromDomain = process.env.RESEND_FROM_DOMAIN;
  const fromAddress = fromDomain
    ? `SkyHigh Paragliding <noreply@${fromDomain}>`
    : "SkyHigh Paragliding <onboarding@resend.dev>";

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [options.to],
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      log.error(`Resend API error (${response.status}): ${body}`);
      return { success: false, error: `Email send failed: ${response.status}` };
    }

    const data = await response.json();
    log.info(`Email sent to ${options.to} (id: ${data.id})`);
    return { success: true };
  } catch (err: any) {
    log.error(`Email send error: ${err.message}`);
    return { success: false, error: err.message };
  }
}
