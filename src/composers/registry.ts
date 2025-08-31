import { Composer, InlineKeyboard } from "grammy";
import { BotContext, RegStatus } from "../mod.ts";
import { getProfile, setProfile } from "../db/profile.ts";

export const registryComposer = new Composer<BotContext>();

const back = new InlineKeyboard().text("< Назад", "back");

const genReplyMarkup = (ctx: BotContext) => {
  const reply_markup = new InlineKeyboard()
    .text(`Имя: ${ctx.session.name || "-"}`, "name").row()
    .text(`Фамилия: ${ctx.session.surname || "-"}`, "surname").row()
    .text(
      `Бесплатник: ${
        ctx.session.isFree != undefined
          ? (ctx.session.isFree ? "Да✅" : "Нет❌")
          : "-"
      }`,
      "paid",
    ).row();
  if (
    ctx.session.name &&
    ctx.session.surname &&
    ctx.session.isFree != undefined
  ) {
    reply_markup.text("Подтвердить и закончить", "check");
  } else {
    reply_markup.text("Необходимо заполнить все поля❗");
  }
  return reply_markup;
};

registryComposer.chatType("private").command("register", async (ctx) => {
  ctx.session = {};
  const profile = await getProfile(ctx.from.id);
  if (profile != null) {
    await ctx.reply("Ты уже зарегистрирован");
    return;
  }

  const cardMsg = await ctx.reply("Регистрация: ", {
    reply_markup: genReplyMarkup(ctx),
  });
  ctx.session.cardId = cardMsg.message_id;
});

registryComposer.chatType("private").callbackQuery("back", async (ctx) => {
  ctx.session.status = undefined;
  await ctx.editMessageText("Регистрация: ", {
    reply_markup: genReplyMarkup(ctx),
  });
});

registryComposer.chatType("private").callbackQuery("name", async (ctx) => {
  ctx.session.status = RegStatus.name;
  await ctx.editMessageText("Напиши свое имя", { reply_markup: back });
});

registryComposer.chatType("private")
  .filter((ctx) => checkStatus(ctx, RegStatus.name))
  .on("message:text", async (ctx) => {
    ctx.session.name = ctx.msg.text;
    ctx.session.status = undefined;

    await ctx.api.editMessageText(
      ctx.chat.id,
      ctx.session.cardId || -1,
      "Регистрация: ",
      { reply_markup: genReplyMarkup(ctx) },
    );
    await ctx.deleteMessage();
  });

registryComposer.chatType("private").callbackQuery("surname", async (ctx) => {
  ctx.session.status = RegStatus.surname;
  await ctx.editMessageText("Напиши свою фамилию", { reply_markup: back });
});

registryComposer.chatType("private")
  .filter((ctx) => checkStatus(ctx, RegStatus.surname))
  .on("message:text", async (ctx) => {
    ctx.session.surname = ctx.msg.text;
    ctx.session.status = undefined;

    await ctx.api.editMessageText(
      ctx.chat.id,
      ctx.session.cardId || -1,
      "Регистрация: ",
      { reply_markup: genReplyMarkup(ctx) },
    );
    await ctx.deleteMessage();
  });

registryComposer.chatType("private").callbackQuery("paid", async (ctx) => {
  const reply_markup = new InlineKeyboard()
    .text("Да✅", "yes").text("Нет❌", "no").row()
    .text("< Назад", "back");
  await ctx.editMessageText("Ты бесплатник?", { reply_markup });
});

registryComposer.chatType("private")
  .callbackQuery(/(yes)|(no)/, async (ctx) => {
    ctx.session.isFree = ctx.callbackQuery.data == "yes";
    ctx.session.status = undefined;

    await ctx.editMessageText("Регистрация:", {
      reply_markup: genReplyMarkup(ctx),
    });
  });

registryComposer.chatType("private").callbackQuery("check", async (ctx) => {
  const reply_markup = new InlineKeyboard()
    .text("Подтвердить✅", "confirm").row()
    .text("Исправить❌", "back");

  await ctx.editMessageText(
    `Проверь что я получил:\n\nИмя: ${ctx.session.name}\nФамилия: ${ctx.session.surname}\nБесплатник: ${
      ctx.session.isFree ? "Да✅" : "Нет❌"
    }`,
    { reply_markup },
  );
});

registryComposer.chatType("private").callbackQuery("confirm", async (ctx) => {
  await setProfile(
    ctx.from.id,
    ctx.session.name || "N",
    ctx.session.surname || "N",
    ctx.session.isFree || false,
  );
  await ctx.reply("Профиль создан");
  ctx.session = {};
});

const checkStatus = (ctx: BotContext, status: RegStatus) =>
  ctx.session.status == status;
