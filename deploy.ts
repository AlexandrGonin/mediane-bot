import { webhookCallback } from "grammy";
import { bot } from "./src/mod.ts";

// Telegram присылает этот секрет в заголовке каждого апдейта.
// Без него ручку /bot может дёргать кто угодно, притворяясь любым user_id.
const SECRET = Deno.env.get("WEBHOOK_SECRET") || "";
if (!SECRET) {
  console.error(
    "WEBHOOK_SECRET не задан — вебхук будет отклонять все запросы. " +
      "Задай переменную: только A-Z a-z 0-9 _ -, от 1 до 256 символов.",
  );
}

const handleUpdate = webhookCallback(bot, "std/http");

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method == "POST" && url.pathname == "/bot") {
    const given = req.headers.get("x-telegram-bot-api-secret-token");
    if (!SECRET || given !== SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    try {
      return await handleUpdate(req);
    } catch (err) {
      console.error("webhook:", err);
      return new Response("error", { status: 500 });
    }
  }

  if (url.pathname == "/webhook") {
    if (!SECRET || url.searchParams.get("key") !== SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    try {
      await bot.api.setWebhook(`https://${url.hostname}/bot`, {
        secret_token: SECRET,
        drop_pending_updates: true,
      });
      return new Response("Done. Set");
    } catch (err) {
      console.error("setWebhook:", err);
      return new Response("Couldn't succeed with installing webhook", {
        status: 500,
      });
    }
  }

  return Response.redirect("https://t.me/constant0fps", 302);
});
