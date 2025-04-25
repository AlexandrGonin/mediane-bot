import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";
import { freeStorage } from "https://deno.land/x/grammy_storages@v2.4.2/free/src/mod.ts";
import { entryComposer } from "./composers/entry.ts";
import { channelComposer, generatePostText } from "./composers/channel.ts";
import { registryComposer } from "./composers/registry.ts";
import {
  deletePost,
  getPost,
  listChannels,
  requestPostClose,
  setPost,
} from "./db/channel.ts";
import { utilComposer } from "./composers/util.ts";

export interface SessionData {
  registryStatus?: "name" | "surname" | "paid";
  name?: string;
  surname?: string;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export const bot = new Bot<BotContext>(Deno.env.get("TOKEN") || "");
export const kv = await Deno.openKv();
export const adminId = Number(Deno.env.get("ADMIN_ID") || "");

bot.use(
  session({
    initial: () => ({}),
    storage: freeStorage<SessionData>(bot.token),
  }),
);

bot.command("cancel", async (ctx) => {
  ctx.session.registryStatus = undefined;
  ctx.session.name = undefined;
  ctx.session.surname = undefined;
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

// post closing
const closePost = async (value: { channelId: number; date: Date }) => {
  const { channelId, date } = value;
  if (!channelId || !date) return;

  const post = await getPost(channelId, date);
  if (!post) return;
  if (adminId) {
    await bot.api.forwardMessage(adminId, channelId, post);
  }

  const reply_markup = new InlineKeyboard().text("🔒 Запись закрыта", "closed");
  await bot.api.editMessageReplyMarkup(channelId, post, { reply_markup });

  await deletePost(channelId, date);
};

bot.chatType("private").command("close", async (ctx) => {
  const channelId = Number(ctx.match);
  if (!channelId) {
    await ctx.react("🌚");
    return;
  }
  const chatMember = await ctx.api.getChatMember(channelId, ctx.from.id);
  const allowedStatuses = ["creator", "administrator"];
  if (!allowedStatuses.includes(chatMember.status)) {
    await ctx.react("🤨");
    return;
  }
  await closePost({ channelId, date: new Date() });
  await ctx.react("👌");
});

bot.use(utilComposer);
bot.use(registryComposer);
bot.use(entryComposer);
bot.use(channelComposer);

Deno.cron("daily entry", "30 2 * * MON-SAT", async () => {
  const delay = 3 * 60 * 60 * 1000;

  for (const channel of await listChannels()) {
    const now = new Date();
    const reply_markup = new InlineKeyboard().url(
      "Запись в боте",
      `https://t.me/${bot.botInfo.username}?start=${channel.id}`,
    );
    try {
      const msg = await bot.api.sendMessage(
        channel.id,
        await generatePostText(channel.id, now),
        { reply_markup, parse_mode: "HTML" },
      );

      await setPost(channel.id, now, msg.message_id);
      await requestPostClose(channel.id, now, delay);
    } catch {
      console.error("Could not send message to allowed, channel, continuing");
    }
  }
});

kv.listenQueue(closePost);

bot.catch(console.error);
