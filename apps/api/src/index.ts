import { serve } from "@hono/node-server";
import { loadEnv } from "./env.js";
import { initMonitoring } from "./monitoring.js";
import { createProductionApi } from "./server.js";

const env = loadEnv();
initMonitoring("api");
const { app, db } = createProductionApi(env);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void db.close().then(() => process.exit(0));
  });
}
