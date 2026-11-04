import { createApp } from "./app.ts";
const app = await createApp({
  serveStatic: process.env.NODE_ENV === "production",
});
await app.listen({
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "127.0.0.1",
});
console.log(
  `Teamfare API listening on ${app.server.address() && typeof app.server.address() === "object" ? JSON.stringify(app.server.address()) : "configured address"}`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
