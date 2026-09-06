export interface SendEmailInput {
  to: string;
  subject: string;
  bodyHtml: string;
}

export interface SendSmsInput {
  to: string;
  body: string;
}

export interface SendResult {
  externalMessageId: string | null;
  success: boolean;
  errorMessage?: string;
}

export interface NotificationProvider {
  sendEmail(input: SendEmailInput): Promise<SendResult>;
  sendSms(input: SendSmsInput): Promise<SendResult>;
}
