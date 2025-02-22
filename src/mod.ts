import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";
import { freeStorage } from "https://deno.land/x/grammy_storages@v2.4.2/free/src/mod.ts";
import { entryComposer } from "./composers/entry.ts";
import { channelComposer } from "./composers/channel.ts";
import { channelKey, deletePost, getPost } from "./db/channel.ts";
import { getProfile, setProfile } from "./db/profile.ts";

interface SessionData {
  registryStatus?: "name" | "surname" | "paid";
  name?: string;
  surname?: string;
}

type BotContext = Context & SessionFlavor<SessionData>;

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
// register
bot.chatType("private").command("register", async (ctx) => {
  const profile = await getProfile(ctx.from.id);
  if (!profile) {
    ctx.session.registryStatus = "name";
    await ctx.reply("Напиши свое имя");
  } else {
    await ctx.reply("Ты уже зарегистрирован");
  }
});
// get name
bot.chatType("private")
  .filter((ctx) => checkStatus(ctx, "name"))
  .on("msg:text", async (ctx) => {
    ctx.session.name = ctx.msg.text;
    ctx.session.registryStatus = "surname";
    await ctx.reply("Теперь напиши свою фамилию");
  });
// got surname
bot.chatType("private")
  .filter((ctx) => checkStatus(ctx, "surname"))
  .on("msg:text", async (ctx) => {
    ctx.session.surname = ctx.msg.text;
    ctx.session.registryStatus = "paid";
    const keyboard = new InlineKeyboard();
    keyboard.text("Да ✅", "yes").text("Нет ❌", "no");
    await ctx.reply("Ты бесплатник?", { reply_markup: keyboard });
  });
// if free cafeteria
bot.chatType("private")
  .filter((ctx) => checkStatus(ctx, "paid"))
  .callbackQuery("yes", async (ctx) => {
    ctx.session.registryStatus = undefined;
    await setProfile(
      ctx.from.id,
      ctx.session.name || "",
      ctx.session.surname || "",
      true,
    );
    await ctx.editMessageText(ctx.msg?.text + `\n\nДа ✅`);
    await ctx.reply("Сделано!");
  });
// if paid cafeteria
bot.chatType("private")
  .filter((ctx) => checkStatus(ctx, "paid"))
  .callbackQuery("no", async (ctx) => {
    ctx.session.registryStatus = undefined;
    await setProfile(
      ctx.from.id,
      ctx.session.name || "",
      ctx.session.surname || "",
      false,
    );
    await ctx.editMessageText(ctx.msg?.text + `\n\nНет ❌`);
    await ctx.reply("Сделано!");
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

const checkStatus = (ctx: BotContext, status: SessionData["registryStatus"]) =>
  ctx.session.registryStatus == status;
