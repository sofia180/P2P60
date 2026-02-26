import { startApi } from "./api/server.js";
import { startBot } from "./bot/bot.js";
import { config } from "./config.js";

const main = async () => {
  startApi();
  if (config.botToken) {
    await startBot();
  } else {
    console.warn("BOT_TOKEN missing - bot not started");
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
