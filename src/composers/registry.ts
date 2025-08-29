import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../mod.ts";
import { setProfile } from "../db/profile.ts";

export const registryComposer = new Composer<BotContext>();
const header = "Регистрация:\n";
const name = "\nИмя: ";
const surname = "\nФамилия: ";
const free = "\nБесплатник: ";
const footer = "\n\nВсе правильно?";

const generateText = (ctx: BotContext) =>
  header +
  name +
  (ctx.session.name || (ctx.session.registryStatus == "name" ? "___" : "-")) +
  surname +
  (ctx.session.surname ||
    (ctx.session.registryStatus == "surname" ? "___" : "-")) +
  free +
  (ctx.session.isFree == undefined
    ? (ctx.session.registryStatus == "paid" ? "___" : "-")
    : (ctx.session.isFree ? "✅" : "❌")) +
  (ctx.session.registryStatus == "check" ? footer : "");

registryComposer.chatType("private").command("register", async (ctx) => {
  ctx.session.registryStatus = "name";

  // create registry card
  const registrationMsg = await ctx.reply(generateText(ctx));
  ctx.session.cardId = registrationMsg.message_id;

  // create guidance
  const nameMsg = await ctx.reply("Напиши свое имя");
  ctx.session.guidanceId = nameMsg.message_id;
});

registryComposer.chatType("private").filter((ctx) => checkStatus(ctx, "name"))
  .on("message:text", async (ctx) => {
    ctx.session.name = ctx.msg.text;
    ctx.session.registryStatus = "surname";
    await ctx.deleteMessage();

    // edit card
    await ctx.api.editMessageText(
      ctx.chat.id,
      ctx.session.cardId || -1,
      generateText(ctx),
    );

    // edit guidance
    if (ctx.session.guidanceId) {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.session.guidanceId);
    }
    const surnameMsg = await ctx.reply("Теперь напиши свою фамилию");
    ctx.session.guidanceId = surnameMsg.message_id;
  });

registryComposer.chatType("private").filter((ctx) =>
  checkStatus(ctx, "surname")
)
  .on("message:text", async (ctx) => {
    ctx.session.surname = ctx.msg.text;
    ctx.session.registryStatus = "paid";

    // remove guidance
    if (ctx.session.guidanceId) {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.session.guidanceId);
    }
    await ctx.deleteMessage();

    // edit card
    const reply_markup = new InlineKeyboard();
    reply_markup.text("Я бесплатник✅", "yes").text("Я не бесплатник❌", "no");
    await ctx.api.editMessageText(
      ctx.chat.id,
      ctx.session.cardId || -1,
      generateText(ctx),
      { reply_markup },
    );
  });

registryComposer.chatType("private").filter((ctx) => checkStatus(ctx, "paid"))
  .callbackQuery(/(yes)|(no)/, async (ctx) => {
    ctx.session.isFree = ctx.callbackQuery.data == "yes";
    ctx.session.registryStatus = "check";

    // edit card
    const reply_markup = new InlineKeyboard();
    reply_markup
      .text("Все правильно✅", "yes")
      .text("Нет, нужно исправить❌", "no");
    await ctx.editMessageText(
      generateText(ctx),
      { reply_markup },
    );
  });

registryComposer.chatType("private").filter((ctx) => checkStatus(ctx, "check"))
  .callbackQuery(/(yes)|(no)/, async (ctx) => {
    ctx.session.registryStatus = undefined;
    const right = ctx.callbackQuery.data == "yes";

    await ctx.editMessageText(
      generateText(ctx) + (right ? "\n\nПравильно✅" : "\n\nНе правильно❌"),
    );

    if (right) {
      await setProfile(
        ctx.from.id,
        ctx.session.name || "N",
        ctx.session.surname || "N",
        ctx.session.isFree || false,
      );
      await ctx.reply("Профиль создан");
    } else {
      ctx.reply("Попробуй еще раз через /register");
    }

    ctx.session = {};
  });

const checkStatus = (
  ctx: BotContext,
  status: "name" | "surname" | "paid" | "check",
) => ctx.session.registryStatus == status;
