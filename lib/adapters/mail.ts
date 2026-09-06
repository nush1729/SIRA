export interface MailAdapter {
  send(m: { to: string; subject: string; html: string }): Promise<{ ok: boolean }>;
}

export const MockMailer: MailAdapter = {
  async send(m) {
    console.log(`[MockMailer] Sent email to ${m.to}: ${m.subject}`);
    return { ok: true };
  }
};

/**
 * PROVIDER_MODE=google sends real Gmail; anything else records the email and
 * logs it. Missing credentials fall back to mock loudly rather than throwing —
 * a half-configured environment should degrade, not break the product.
 */
export function getMailAdapter(): MailAdapter {
  if (process.env.PROVIDER_MODE !== 'google') return MockMailer;

  const { GmailMailer, googleCredentialsPresent } = require('./google') as typeof import('./google');
  if (!googleCredentialsPresent()) {
    console.warn('[mail] PROVIDER_MODE=google but Google credentials are missing — using MockMailer.');
    return MockMailer;
  }
  return GmailMailer;
}
