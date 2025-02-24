import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";
import { freeStorage } from "https://deno.land/x/grammy_storages@v2.4.2/free/src/mod.ts";
import { entryComposer } from "./composers/entry.ts";
import { channelComposer } from "./composers/channel.ts";
import { registryComposer } from "./composers/registry.ts";
import { channelKey, deletePost, getPost } from "./db/channel.ts";
import { monthAsText } from "./db/offload.ts";

export interface SessionData {
  registryStatus?: "name" | "surname" | "paid";
  name?: string;
  surname?: string;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export const bot = new Bot<BotContext>(Deno.env.get("TOKEN") || "");
export const kv = await Deno.openKv();

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

bot.chatType("private").command("data", async (ctx) => {
  const channelId = Number(ctx.match);
  if (ctx.match) {
    await ctx.reply(await monthAsText(channelId));
  } else {
    await ctx.react("🌚");
  }
});

// add channel to approved list
bot.chatType("private").command("add", async (ctx) => {
  const channelId = Number(ctx.match);
  if (channelId) {
    await kv.set(channelKey(channelId), true);
    await ctx.reply(`Канал с ID ${ctx.match} добавлен в разрешенные`);
  } else {
    await ctx.reply("Неправильный ID канала");
  }
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

bot.use(registryComposer);
bot.use(entryComposer);
bot.use(channelComposer);

// post closing
kv.listenQueue(async (value: { channelId: number; date: Date }) => {
  const { channelId, date } = value;
  if (!channelId || !date) return;

  const post = await getPost(channelId, date);
  if (!post) return;

  const reply_markup = new InlineKeyboard().text("🔒 Запись закрыта", "closed");
  await bot.api.editMessageReplyMarkup(channelId, post, { reply_markup });

  await deletePost(channelId, date);
});

bot.catch(console.error);
