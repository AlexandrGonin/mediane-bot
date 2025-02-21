import { Bot, InlineKeyboard } from "grammy";
import { entryComposer } from "./composers/entry.ts";
import { channelComposer } from "./composers/channel.ts";
import { channelKey, deletePost, getPost } from "./db/channel.ts";
import file from "../data.json" with { type: "json" };
import profiles from "../profiles.json" with { type: "json" };

export const bot = new Bot(Deno.env.get("TOKEN") || "");
export const kv = await Deno.openKv();

bot.use(entryComposer);
bot.use(channelComposer);

bot.chatType("private").command("start", async (ctx) => {
  await Promise.all(file.map(async (obj) => await kv.set(obj.key, obj.value)));
  await Promise.all(
    profiles.map(async (obj) => await kv.set(obj.key, obj.value)),
  );
  await kv.set(channelKey(-1002402854227), true);
  await ctx.reply("Done!");
});

bot.callbackQuery(
  "closed",
  async (c) =>
    await c.answerCallbackQuery({
      text:
        "🔒 Запись закрыта!\n\nСкорее всего, вышло время, до которого можно было записаться.",
      show_alert: true,
    }),
);

kv.listenQueue(async (value: { channelId: number; date: Date }) => {
  const { channelId, date } = value;
  if (!channelId || !date) return;

  const post = await getPost(channelId, date);
  if (!post) return;

  const reply_markup = new InlineKeyboard().text("🔒 Запись закрыта", "closed");
  await bot.api.editMessageReplyMarkup(channelId, post, { reply_markup });

  await deletePost(channelId, date);
});

bot.catch((e) => console.error(e.message));
