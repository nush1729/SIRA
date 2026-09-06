export interface MailAdapter {
  send(m: { to: string; subject: string; html: string }): Promise<{ ok: boolean }>;
}

export const MockMailer: MailAdapter = {
  async send(m) {
    console.log(`[MockMailer] Sent email to ${m.to}: ${m.subject}`);
    return { ok: true };
  }
};

export function getMailAdapter(): MailAdapter {
  // If PROVIDER_MODE is google, we'd normally return GoogleMailer, but for MVP we return MockMailer.
  return MockMailer;
}
