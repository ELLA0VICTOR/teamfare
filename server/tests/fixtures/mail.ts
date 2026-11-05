import type { AuthMailer, MailMessage } from "../../mail.ts";
import { writeFile } from "node:fs/promises";
export function testMailbox(path?: string) {
  const messages: MailMessage[] = [];
  let writing = Promise.resolve();
  const mailer: AuthMailer = {
    async send(message) {
      messages.push(message);
      if (path) {
        writing = writing.then(() => writeFile(path, JSON.stringify(messages)));
        await writing;
      }
    },
  };
  return {
    mailer,
    messages,
    code(email: string) {
      const message = messages.findLast(
        (message) =>
          message.to === email && /Your Teamfare code/.test(message.text),
      );
      const code = message?.text.match(/is (\d{6})\./)?.[1];
      if (!code) throw new Error("No fixture code for that test account.");
      return code;
    },
  };
}
