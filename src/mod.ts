import { DenoKVAdapter } from "storage";
import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";
import { channelComposer, generatePostText } from "./composers/channel.ts";
import { entryComposer } from "./composers/entry.ts";
import { registryComposer } from "./composers/registry.ts";
import { utilComposer } from "./composers/util.ts";
import { getAdmin, listChannels, requestPostClose } from "./db/channel.ts";
import { deletePost, getPost, Post, setPost } from "./db/post.ts";

export enum RegStatus {
  name,
  surname,
}

export interface SessionData {
  status?: RegStatus;
  name?: string;
  surname?: string;
  isFree?: boolean;
  cardId?: number;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export const bot = new Bot<BotContext>(Deno.env.get("TOKEN") || "");
export const kv = await Deno.openKv();

bot.use(session({
  initial: () => ({}),
  storage: new DenoKVAdapter(kv),
}));

bot.command("cancel", async (ctx) => {
  ctx.session = {};
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

bot.chatType("private").command("stop", async (ctx) => {
  await kv.set(["open"], false);
  await ctx.reply("closed");
});

bot.chatType("private").command("open", async (ctx) => {
  await kv.set(["open"], true);
  await ctx.reply("open");
});

bot.use(utilComposer);
bot.use(registryComposer);
bot.use(entryComposer);
bot.use(channelComposer);

// post opening
Deno.cron("daily entry", "15 2 * * MON-SAT", async () => {
  const open = (await kv.get<boolean>(["open"])).value;
  if (!open) return;
  const delay = 3 * 60 * 60 * 1000;
  const botName = (await bot.api.getMe()).username;

  for (const channel of await listChannels()) {
    const now = new Date();
    const reply_markup = new InlineKeyboard().url(
      "Запись в боте",
      `https://t.me/${botName}?start=${channel.id}`,
    );
    try {
      const post = await bot.api.sendMessage(channel.id, "post");
      const postId = await setPost(
        {
          channel_id: channel.id,
          message_id: post.message_id,
          name: `на ${
            now.toLocaleDateString("ru", { timeZone: "Asia/Yekaterinburg" })
          }`,
          date: now,
        } as Post,
      );
      await bot.api.editMessageText(
        channel.id,
        post.message_id,
        await generatePostText(postId),
        { reply_markup },
      );
      await requestPostClose(postId, delay);
    } catch {
      console.error(
        `Could not send message to allowed channel ${channel.id}, continuing`,
      );
    }
  }
});

// post closing
export const closePost = async (postId: string) => {
  const post = await getPost(postId);
  if (!post) return;
  const adminId = await getAdmin(post.channel_id);
  if (adminId) {
    await bot.api.forwardMessage(adminId, post.channel_id, post.message_id);
  }

  const reply_markup = new InlineKeyboard().text("🔒 Запись закрыта", "closed");
  await bot.api.editMessageReplyMarkup(post.channel_id, post.message_id, {
    reply_markup,
  });

  await deletePost(postId);
};

kv.listenQueue(closePost);

bot.catch(console.error);
