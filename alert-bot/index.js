// Entry point: `TELEGRAM_TOKEN=... node index.js`
import { createTelegram } from "./telegram.js";
import * as mexc from "./mexc.js";
import { createBot, loadState, saveState } from "./bot.js";

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error("Set TELEGRAM_TOKEN (get one from @BotFather).");
  process.exit(1);
}

const config = {
  inviteCode: process.env.MEXC_INVITE_CODE || "",
  channelId: process.env.CHANNEL_ID || "", // e.g. @your_channel, bot must be an admin
  proStars: Number(process.env.PRO_STARS || 250),
  movePct: Number(process.env.MOVE_PCT || 10),
  moveWindowMin: Number(process.env.MOVE_WINDOW_MIN || 15),
};
const stateFile = process.env.STATE_FILE || "state.json";
const state = loadState(stateFile);
const tg = createTelegram(token);
const bot = createBot({ tg, mexc, state, config, save: () => saveState(stateFile, state) });

function every(ms, name, fn) {
  const run = () => fn().catch((err) => console.error(`${name}: ${err.message}`)).finally(() => setTimeout(run, ms));
  run();
}

every(60_000, "listings", bot.checkListings);
every(30_000, "prices", bot.checkPrices);

(async function poll() {
  for (;;) {
    try {
      const updates = await tg.getUpdates(state.offset);
      for (const update of updates) {
        state.offset = update.update_id + 1;
        await bot.handleUpdate(update).catch((err) => console.error(`update: ${err.message}`));
      }
      if (updates.length) saveState(stateFile, state);
    } catch (err) {
      console.error(`poll: ${err.message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
})();

console.log("ListingRadar bot running.");
