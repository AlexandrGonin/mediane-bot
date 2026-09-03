import { Composer, InlineKeyboard } from "grammy";
import { BotContext, RegStatus } from "../mod.ts";
import { cleanName, getProfile, MAX_NAME, setProfile } from "../db/profile.ts";

export const registryComposer = new Composer<BotContext>();

const back = new InlineKeyboard().text("< Назад", "back");
const BAD_NAME =
  `Так не пойдёт: нужно от 1 до ${MAX_NAME} символов и без команд. Попробуй ещё раз.`;

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
    reply_markup.text("Необходимо заполнить все поля❗", "noop");
  }
  return reply_markup;
};

registryComposer.chatType("private").callbackQuery("noop", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Заполни все поля" });
});

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
  await ctx.answerCallbackQuery();
});

registryComposer.chatType("private").callbackQuery("name", async (ctx) => {
  ctx.session.status = RegStatus.name;
  ctx.session.cardId = ctx.callbackQuery.message?.message_id;
  await ctx.editMessageText("Напиши свое имя", { reply_markup: back });
  await ctx.answerCallbackQuery();
});

registryComposer.chatType("private").callbackQuery("surname", async (ctx) => {
  ctx.session.status = RegStatus.surname;
  ctx.session.cardId = ctx.callbackQuery.message?.message_id;
  await ctx.editMessageText("Напиши свою фамилию", { reply_markup: back });
  await ctx.answerCallbackQuery();
});

// один обработчик на оба поля: раньше их было два, и оба молча
// съедали любой текст, включая команды
registryComposer.chatType("private")
  .filter((ctx) =>
    ctx.session.status === RegStatus.name ||
    ctx.session.status === RegStatus.surname
  )
  .on("message:text", async (ctx, next) => {
    // команды пропускаем дальше, иначе "/start" записывался бы в имя
    if (ctx.msg.text.startsWith("/")) {
      ctx.session.status = undefined;
      await next();
      return;
    }

    const value = cleanName(ctx.msg.text);
    if (!value) {
      await ctx.reply(BAD_NAME);
      return;
    }

    if (ctx.session.status === RegStatus.name) ctx.session.name = value;
    else ctx.session.surname = value;
    ctx.session.status = undefined;

    // карточки может уже не быть — тогда просто рисуем новую
    if (ctx.session.cardId) {
      try {
        await ctx.api.editMessageText(
          ctx.chat.id,
          ctx.session.cardId,
          "Регистрация: ",
          { reply_markup: genReplyMarkup(ctx) },
        );
      } catch {
        ctx.session.cardId = undefined;
      }
    }
    if (!ctx.session.cardId) {
      const card = await ctx.reply("Регистрация: ", {
        reply_markup: genReplyMarkup(ctx),
      });
      ctx.session.cardId = card.message_id;
    }

    try {
      await ctx.deleteMessage();
    } catch { /* сообщение старше 48 часов или уже удалено */ }
  });

registryComposer.chatType("private").callbackQuery("paid", async (ctx) => {
  const reply_markup = new InlineKeyboard()
    .text("Да✅", "yes").text("Нет❌", "no").row()
    .text("< Назад", "back");
  await ctx.editMessageText("Ты бесплатник?", { reply_markup });
  await ctx.answerCallbackQuery();
});

registryComposer.chatType("private")
  .callbackQuery(["yes", "no"], async (ctx) => {
    ctx.session.isFree = ctx.callbackQuery.data == "yes";
    ctx.session.status = undefined;

    await ctx.editMessageText("Регистрация:", {
      reply_markup: genReplyMarkup(ctx),
    });
    await ctx.answerCallbackQuery();
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
  await ctx.answerCallbackQuery();
});

registryComposer.chatType("private").callbackQuery("confirm", async (ctx) => {
  await ctx.editMessageReplyMarkup();

  // повторная проверка: карточка могла провисеть с прошлого раза,
  // и через неё можно было переписать себе имя в обход владельца
  if (await getProfile(ctx.from.id)) {
    await ctx.reply("Ты уже зарегистрирован");
    ctx.session = {};
    await ctx.answerCallbackQuery();
    return;
  }

  const name = cleanName(ctx.session.name);
  const surname = cleanName(ctx.session.surname);
  if (name && surname && ctx.session.isFree != undefined) {
    await setProfile(ctx.from.id, name, surname, ctx.session.isFree);
    await ctx.reply("Профиль создан");
  } else {
    await ctx.reply("Недостаточно данных");
  }
  ctx.session = {};
  await ctx.answerCallbackQuery();
});
