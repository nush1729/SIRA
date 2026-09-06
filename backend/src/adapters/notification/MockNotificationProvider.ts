import { logger } from "../../lib/logger";
import { NotificationProvider, SendEmailInput, SendResult, SendSmsInput } from "./NotificationProvider";

/**
 * Demo/Sandbox notification adapter. Doesn't send anything externally — the caller
 * (NotificationService) is responsible for persisting a Notification row with the fully
 * rendered subject/body before calling this, so the Notifications Center page in the UI can show
 * exactly what "would have" gone out (e.g. "Email sent to priya.k@demo.smartscheduler.test —
 * Subject: Your interview is confirmed") without any real inbox involved. This function just
 * simulates network latency/success and logs safely (recipient redacted — see logger.ts).
 */
export class MockNotificationProvider implements NotificationProvider {
  async sendEmail(input: SendEmailInput): Promise<SendResult> {
    logger.info({ subject: input.subject }, "[sandbox] would send email");
    return { externalMessageId: `mock-email-${Date.now()}`, success: true };
  }

  async sendSms(input: SendSmsInput): Promise<SendResult> {
    logger.info({}, "[sandbox] would send SMS");
    return { externalMessageId: `mock-sms-${Date.now()}`, success: true };
  }
}
