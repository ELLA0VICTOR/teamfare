// Only used by playwright.agent.config.ts. Production never loads this fixture.
import { createApp } from "../../server/app.ts";
import { fixtureProviders } from "../../server/tests/fixtures/research-provider.ts";
import { testMailbox } from "../../server/tests/fixtures/mail.ts";
const box = testMailbox("./.artifacts/agent-mailbox.json");
const app = await createApp({
  databasePath: "./.artifacts/agent-browser.sqlite",
  origin: "http://127.0.0.1:5180",
  agentProviders: fixtureProviders(),
  authLimit: 100,
  mailer: box.mailer,
  authSecret: "test-only-secret-with-at-least-32-characters",
});
await app.listen({ host: "127.0.0.1", port: 3004 });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
