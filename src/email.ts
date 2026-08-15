import { Resend } from "resend";
import { config } from "./config.js";

export async function sendReportEmail(subject: string, html: string): Promise<void> {
  const resend = new Resend(config.email.resendApiKey);
  const { error } = await resend.emails.send({
    from: config.email.from,
    to: config.email.to,
    subject,
    html,
  });
  if (error) {
    throw new Error(`Resend no pudo enviar el email: ${error.message}`);
  }
}
