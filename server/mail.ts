import { z } from "zod";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  id: string;
  attachments?: { filename: string; content: string }[];
};
export type AuthMailer = { send(message: MailMessage): Promise<void> };
export class MailError extends Error {}
let nextTransport = Promise.resolve();
let lastTransportAt = 0;
async function transportSlot() {
  const slot = nextTransport.then(async () => {
    const delay = 600 - (Date.now() - lastTransportAt);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    lastTransportAt = Date.now();
  });
  nextTransport = slot.catch(() => {});
  await slot;
}
export function mailSetup() {
  const missing = ["RESEND_API_KEY", "EMAIL_FROM", "AUTH_SECRET"].filter(
    (name) => !process.env[name]?.trim(),
  );
  return {
    ready: missing.length === 0 && (process.env.AUTH_SECRET?.length ?? 0) >= 32,
    missing,
  };
}
export function resendMailer(): AuthMailer {
  const key = process.env.RESEND_API_KEY?.trim(),
    from = process.env.EMAIL_FROM?.trim();
  return {
    async send(message) {
      if (!key || !from || /[\r\n]/.test(from) || from.length > 200)
        throw new MailError(
          "Email delivery is not configured. Please contact the team administrator.",
        );
      let response: Response;
      try {
        await transportSlot();
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.id,
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.attachments?.length
              ? { attachments: message.attachments }
              : {}),
          }),
        });
      } catch {
        throw new MailError(
          "The email service is unavailable. Please try again shortly.",
        );
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new MailError(
          "The email service could not send your code. Please contact the team administrator or try again later.",
        );
      }
      const result: unknown = await response.json().catch(() => null);
      if (!z.object({ id: z.string().min(1) }).safeParse(result).success)
        throw new MailError(
          "The email service did not confirm delivery acceptance. Please try again later.",
        );
    },
  };
}
