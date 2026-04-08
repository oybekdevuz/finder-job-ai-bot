import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { app, injectWebSocket } from "../config/app";
import { CC_EXECUTE_TEST, CC_WWWROOT_PORT } from "../config/params";

import "../routes/session";
import { startTelegramBot } from "./telegram";
import { startScraper } from "./scraper";

const main = async () => {
  if (CC_EXECUTE_TEST) {
    return;
  }

  const server = serve({
    fetch: app.fetch,
    port: CC_WWWROOT_PORT,
    hostname: "0.0.0.0",
  });

  server.addListener("listening", () => {
    console.log(`Server listening on http://localhost:${CC_WWWROOT_PORT}`);
  });

  injectWebSocket(server);

  // Start Telegram bot
  await startTelegramBot();

  // Start channel scraper CRON
  await startScraper();
};

main();
