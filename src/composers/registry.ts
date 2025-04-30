import { Composer, InlineKeyboard } from "grammy";
import { getProfile, setProfile } from "../db/profile.ts";
import { BotContext, SessionData } from "../mod.ts";

export const registryComposer = new Composer<BotContext>();
// register
registryComposer.chatType("private").command("register", async (ctx) => {
  const profile = await getProfile(ctx.from.id);
  if (profile) {
    await ctx.reply("Ты уже зарегистрирован");
    return;
  }
  ctx.session.registryStatus = "name";
  await ctx.reply("Напиши свое имя");
});
// get name
registryComposer.chatType("private")
  .filter((ctx) => checkStatus(ctx, "name"))
  .on("msg:text", async (ctx) => {
    ctx.session.name = ctx.msg.text;
    ctx.session.registryStatus = "surname";
    await ctx.reply("Теперь напиши свою фамилию");
  });
// got surname
registryComposer.chatType("private")
  .filter((ctx) => checkStatus(ctx, "surname"))
  .on("msg:text", async (ctx) => {
    ctx.session.surname = ctx.msg.text;
    ctx.session.registryStatus = "paid";
    const keyboard = new InlineKeyboard();
    keyboard.text("Да ✅", "yes").text("Нет ❌", "no");
    await ctx.reply("Ты бесплатник?", { reply_markup: keyboard });
  });
// if free cafeteria
registryComposer.chatType("private")
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
registryComposer.chatType("private")
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

const checkStatus = (ctx: BotContext, status: SessionData["registryStatus"]) =>
  ctx.session.registryStatus == status;
