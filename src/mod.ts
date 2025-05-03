import { Bot, Context, InlineKeyboard } from "grammy";
import { ConversationFlavor, conversations } from "grammy/conversations";
import { channelComposer, generatePostText } from "./composers/channel.ts";
import { entryComposer } from "./composers/entry.ts";
import { registryComposer } from "./composers/registry.ts";
import { utilComposer } from "./composers/util.ts";
import {
  deletePost,
  getAdmin,
  getPost,
  listChannels,
  requestPostClose,
  setPost,
} from "./db/channel.ts";

export type BotContext = ConversationFlavor<Context>;

export const bot = new Bot<BotContext>(Deno.env.get("TOKEN") || "");
export const kv = await Deno.openKv();
export const adminId = Number(Deno.env.get("ADMIN_ID") || "");

bot.use(conversations());

bot.command("cancel", async (ctx) => {
  await ctx.conversation.exitAll();
  await ctx.reply("Действие отменено.");
});

bot.callbackQuery(
  "closed",
  async (ctx) =>
    await ctx.answerCallbackQuery({
      text:
        "🔒 Запись закрыта!\n\nСкорее всего, вышло время, до которого можно было записаться.",
      show_alert: true,
    }),
);

bot.use(utilComposer);
bot.use(registryComposer);
bot.use(entryComposer);
bot.use(channelComposer);

// post opening
Deno.cron("daily entry", "15 2 * * MON-SAT", async () => {
  const delay = 3 * 60 * 60 * 1000;
  const botName = (await bot.api.getMe()).username;

  for (const channel of await listChannels()) {
    const now = new Date();
    const reply_markup = new InlineKeyboard().url(
      "Запись в боте",
      `https://t.me/${botName}?start=${channel.id}`,
    );
    try {
      const post = await bot.api.sendMessage(
        channel.id,
        await generatePostText(channel.id, now),
        { reply_markup, parse_mode: "HTML" },
      );

      await setPost(channel.id, now, post.message_id);
      await requestPostClose(channel.id, now, delay);
    } catch {
      console.error("Could not send message to allowed, channel, continuing");
    }
  }
});

// post closing
export const closePost = async (value: { channelId: number; date: Date }) => {
  const { channelId, date } = value;
  if (!channelId || !date) return;

  const post = await getPost(channelId, date);
  if (!post) return;
  const adminId = await getAdmin(channelId);
  if (adminId) {
    await bot.api.forwardMessage(adminId, channelId, post);
  }

  const reply_markup = new InlineKeyboard().text("🔒 Запись закрыта", "closed");
  await bot.api.editMessageReplyMarkup(channelId, post, { reply_markup });

  await deletePost(channelId, date);
};

kv.listenQueue(closePost);

bot.catch(console.error);
