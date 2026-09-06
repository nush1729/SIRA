import sgMail from "@sendgrid/mail";
import twilio from "twilio";
import { env } from "../../config/env";
import { NotificationProvider, SendEmailInput, SendResult, SendSmsInput } from "./NotificationProvider";

/**
 * Real email (SendGrid, free tier: 100/day) + SMS (Twilio, paid — no ongoing free tier) —
 * see architecture doc Section 7.10 for the exact cost breakdown. SMS stays an explicitly
 * opt-in channel layered on email per that section's guidance.
 */
export class LiveNotificationProvider implements NotificationProvider {
  private twilioClient = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN
    ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
    : null;

  constructor() {
    if (env.SENDGRID_API_KEY) sgMail.setApiKey(env.SENDGRID_API_KEY);
  }

  async sendEmail(input: SendEmailInput): Promise<SendResult> {
    try {
      const [res] = await sgMail.send({
        to: input.to,
        from: env.EMAIL_FROM_ADDRESS ?? "no-reply@example.com",
        subject: input.subject,
        html: input.bodyHtml,
      });
      return { externalMessageId: res.headers["x-message-id"] ?? null, success: res.statusCode < 300 };
    } catch (err) {
      return { externalMessageId: null, success: false, errorMessage: (err as Error).message };
    }
  }

  async sendSms(input: SendSmsInput): Promise<SendResult> {
    if (!this.twilioClient) {
      return { externalMessageId: null, success: false, errorMessage: "Twilio not configured" };
    }
    try {
      const message = await this.twilioClient.messages.create({
        to: input.to,
        from: env.TWILIO_FROM_NUMBER,
        body: input.body,
      });
      return { externalMessageId: message.sid, success: true };
    } catch (err) {
      return { externalMessageId: null, success: false, errorMessage: (err as Error).message };
    }
  }
}
