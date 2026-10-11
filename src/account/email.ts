import type { MerchantEmailBinding, MerchantMailIntent } from './config.ts';

export type CapturedMerchantMail = {
  email: string;
  intent: MerchantMailIntent;
  url: string;
};

export type MerchantEmailSink = {
  send: (message: CapturedMerchantMail) => void | Promise<void>;
  take: (email: string) => CapturedMerchantMail | null;
};

/** In-process capture for isolated test fixtures. Never log url/token. */
export function createInProcessEmailSink(): MerchantEmailSink {
  const messages: CapturedMerchantMail[] = [];
  return {
    send(message) {
      messages.push(message);
    },
    take(email) {
      const index = messages.findIndex(item => item.email === email);
      if (index < 0) return null;
      return messages.splice(index, 1)[0] ?? null;
    },
  };
}

function intentFromSubject(subject: string): MerchantMailIntent {
  if (subject.startsWith('Recover')) return 'recovery';
  if (subject.startsWith('Finish')) return 'signup';
  return 'signin';
}

// Each email names what the link does; the link is the only URL in the text part.
const MAIL: Record<MerchantMailIntent, { subject: string; action: string; button: string }> = {
  signup: { subject: 'Finish creating your DinkusKit account', action: 'finish creating your DinkusKit account', button: 'Finish creating your account' },
  signin: { subject: 'Sign in to DinkusKit', action: 'sign in to DinkusKit', button: 'Sign in to DinkusKit' },
  recovery: { subject: 'Recover your DinkusKit account', action: 'recover your DinkusKit account', button: 'Recover your account' },
};

function urlFromMessage(message: { text?: string; html?: string }): string {
  const text = `${message.text ?? ''}\n${message.html ?? ''}`;
  const match = text.match(/https?:\/\/\S+/);
  return match?.[0]?.replace(/"$/, '') ?? '';
}

export function emailBindingFromSink(sink: MerchantEmailSink): MerchantEmailBinding {
  return {
    async send(message) {
      const to = Array.isArray(message.to) ? message.to[0] : message.to;
      sink.send({
        email: String(to ?? '').toLowerCase(),
        intent: intentFromSubject(message.subject),
        url: urlFromMessage(message),
      });
      return { messageId: 'test-sink' };
    },
  };
}

export function createMerchantEmailDelivery(options: {
  sendEmail?: MerchantEmailBinding;
  fromEmail?: string;
  capture?: { put: (key: string, value: string) => Promise<void> };
}) {
  return {
    async deliver(input: { email: string; url: string; intent: MerchantMailIntent }) {
      if (options.capture) {
        await options.capture.put(input.email, JSON.stringify({ intent: input.intent, url: input.url }));
        return { delivered: 'test-sink' as const };
      }
      if (!options.sendEmail) throw new Error('email_unavailable');
      const mail = MAIL[input.intent] ?? MAIL.signin;
      const note = 'The link works once and expires in 5 minutes. If you didn\'t ask for this, you can ignore this email.';
      await options.sendEmail.send({
        to: input.email,
        from: { email: options.fromEmail ?? 'accounts@dinkuskit.com', name: 'DinkusKit' },
        subject: mail.subject,
        text: `Use this link to ${mail.action}:\n${input.url}\n\n${note}\n`,
        html: `<p>Use this link to ${mail.action}.</p><p><a href="${input.url}">${mail.button}</a></p><p>${note}</p>`,
      });
      return { delivered: 'cloudflare-email' as const };
    },
  };
}

export type MerchantEmailDelivery = ReturnType<typeof createMerchantEmailDelivery>;
