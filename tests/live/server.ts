// Isolated Playwright server: this test inbox is never available in the real API.
import { createApp } from "../../server/app.ts";
import { testMailbox } from "../../server/tests/fixtures/mail.ts";
import { Store } from "../../server/store.ts";
import { seedJudges } from "../../server/seed-judges.ts";
const judgeStore = new Store("./.artifacts/live-test.sqlite");
await seedJudges(judgeStore);
judgeStore.close();
const box = testMailbox("./.artifacts/live-mailbox.json");
const app = await createApp({
  databasePath: "./.artifacts/live-test.sqlite",
  origin: "http://127.0.0.1:5178",
  authLimit: 100,
  mailer: box.mailer,
  authSecret: "test-only-secret-with-at-least-32-characters",
});
await app.listen({ host: "127.0.0.1", port: 3002 });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
