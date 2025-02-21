import { Bot, InlineKeyboard } from "grammy";
import { entryComposer } from "./composers/entry.ts";
import { channelComposer } from "./composers/channel.ts";
import { deletePost, getPost } from "./db/channel.ts";

export const bot = new Bot(Deno.env.get("TOKEN") || "");
export const kv = await Deno.openKv();

bot.use(entryComposer);
bot.use(channelComposer);

bot.callbackQuery(
  "closed",
  async (ctx) =>
    await ctx.answerCallbackQuery({
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

bot.catch((err) => console.error(err.message));
