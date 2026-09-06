import prisma from '@/lib/db';
import { getMailAdapter } from './adapters/mail';

export async function sendNotification({
  requestId,
  toEmail,
  template,
  subject,
  body
}: {
  requestId: string;
  toEmail: string;
  template: string;
  subject: string;
  body: string;
}) {
  const mailer = getMailAdapter();
  
  const result = await mailer.send({ to: toEmail, subject, html: body });
  const status = result.ok ? 'SENT' : 'FAILED';
  
  await prisma.notification.create({
    data: {
      requestId,
      toEmail,
      template,
      subject,
      body,
      status
    }
  });
}
