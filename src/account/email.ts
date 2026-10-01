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
  if (subject.startsWith('Confirm')) return 'signup';
  return 'signin';
}

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
      const subject = input.intent === 'recovery'
        ? 'Recover your DinkusKit account'
        : input.intent === 'signup'
          ? 'Confirm your DinkusKit account'
          : 'Sign in to DinkusKit';
      await options.sendEmail.send({
        to: input.email,
        from: { email: options.fromEmail ?? 'accounts@dinkuskit.com', name: 'DinkusKit' },
        subject,
        text: `Use this link to continue. It expires soon.\n${input.url}\n`,
        html: `<p>Use this link to continue. It expires soon.</p><p><a href="${input.url}">Continue</a></p>`,
      });
      return { delivered: 'cloudflare-email' as const };
    },
  };
}

export type MerchantEmailDelivery = ReturnType<typeof createMerchantEmailDelivery>;
