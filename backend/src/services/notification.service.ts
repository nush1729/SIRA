import { NotificationChannel } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notificationProvider } from "../adapters/notification";
import { aiExplainProvider } from "../adapters/ai";
import { logger } from "../lib/logger";

interface QueueNotificationInput {
  roundId: string;
  recipientId: string;
  recipientEmail: string;
  channel: NotificationChannel;
  template: "invite" | "confirm" | "reminder" | "reschedule" | "cancel";
  facts: Record<string, string>;
}

/**
 * Persists the Notification row FIRST (so the Notifications Center UI has something to show
 * even if the send itself fails or is slow — architecture doc Section 12: a failed notification
 * is a visible warning, never a lost booking), then attempts delivery through whichever
 * NotificationProvider is active (Mock in sandbox, SendGrid/Twilio in live).
 */
export const NotificationService = {
  async queueAndSend(input: QueueNotificationInput) {
    const draft = await aiExplainProvider.draftMessage(
      input.template === "reminder" || input.template === "cancel" ? "confirm" : input.template,
      input.facts
    );

    const notification = await prisma.notification.create({
      data: {
        roundId: input.roundId,
        recipientId: input.recipientId,
        channel: input.channel,
        template: input.template,
        status: "QUEUED",
      },
    });

    try {
      const result =
        input.channel === "EMAIL"
          ? await notificationProvider.sendEmail({
              to: input.recipientEmail,
              subject: `Interview update: ${input.template}`,
              bodyHtml: `<p>${draft}</p>`,
            })
          : await notificationProvider.sendSms({ to: input.recipientEmail, body: draft });

      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: result.success ? "SENT" : "FAILED" },
      });
    } catch (err) {
      logger.error({ err, notificationId: notification.id }, "Notification delivery failed");
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "FAILED" } });
    }
  },

  async listForRound(roundId: string) {
    return prisma.notification.findMany({ where: { roundId }, orderBy: { createdAt: "desc" } });
  },
};
