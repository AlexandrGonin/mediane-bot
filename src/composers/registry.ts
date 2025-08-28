import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../mod.ts";
import { getProfile, setProfile } from "../db/profile.ts";

export const registryComposer = new Composer<BotContext>();

registryComposer.chatType("private").command("register", async (ctx) => {
  const profile = await getProfile(ctx.from.id);
  if (profile != null) {
    await ctx.reply("Ты уже зарегестрирован!");
    return;
  }
  ctx.session.registryStatus = "name";
  await ctx.reply("Напиши свое имя");
});

registryComposer.chatType("private")
  .filter((ctx) => checkStatus(ctx, "name"))
  .on("msg:text", async (ctx) => {
    ctx.session.name = ctx.msg.text;
    ctx.session.registryStatus = "surname";
    await ctx.reply("Теперь напиши свою фамилию");
  });

registryComposer.chatType("private")
  .filter((ctx) => checkStatus(ctx, "surname"))
  .on("msg:text", async (ctx) => {
    ctx.session.surname = ctx.msg.text;

    const reply_markup = new InlineKeyboard();
    reply_markup.text("Да", "yes").text("Нет", "no");

    ctx.session.registryStatus = "paid";
    await ctx.reply("Ты бесплатник?", { reply_markup });
  });

registryComposer.chatType("private")
  .filter((ctx) => checkStatus(ctx, "paid"))
  .callbackQuery(/(yes)|(no)/, async (ctx) => {
    ctx.session.isFree = ctx.callbackQuery.data == "yes";
    await ctx.editMessageText(
      ctx.msg?.text + `\n\n${ctx.session.isFree ? "Да" : "Нет"}`,
    );
    ctx.session.registryStatus = "check";
    const reply_markup = new InlineKeyboard();
    reply_markup.text("Правильно", "yes").text("Неправильно", "no");
    await ctx.reply(
      `Проверь то что я получил:\nИмя: ${ctx.session.name}\nФамилия: ${ctx.session.surname}\nБесплатник: ${
        ctx.session.isFree ? "Да" : "Нет"
      }`,
      { reply_markup },
    );
  });

registryComposer.chatType("private")
  .filter((ctx) => checkStatus(ctx, "check"))
  .callbackQuery(/(yes)|(no)/, async (ctx) => {
    await ctx.editMessageText(
      ctx.msg?.text +
        `\n\n${ctx.callbackQuery.data == "yes" ? "Правильно" : "Неправильно"}`,
    );
    if (ctx.callbackQuery.data == "yes") {
      await setProfile(
        ctx.from.id,
        ctx.session.name || "",
        ctx.session.surname || "",
        ctx.session.isFree || false,
      );
      await ctx.reply("Профиль создан");
    }
    ctx.session.name = undefined;
    ctx.session.surname = undefined;
    ctx.session.isFree = undefined;
    ctx.session.registryStatus = undefined;
    if (ctx.callbackQuery.data == "no") {
      await ctx.reply("Попробуй еще раз через /register");
    }
  });

const checkStatus = (
  ctx: BotContext,
  status: "name" | "surname" | "paid" | "check",
) => ctx.session.registryStatus == status;
