import { Composer, Context, InlineKeyboard } from "grammy";
import { getProfile, setProfile } from "../db/profile.ts";
import { BotContext } from "../mod.ts";
import { Conversation, createConversation } from "grammy/conversations";

export const registryComposer = new Composer<BotContext>();

const register = async (convo: Conversation, ctx: Context) => {
  await ctx.reply("Напиши свое имя");
  const nameCtx = await convo.waitFor("message:text");
  const name = nameCtx.msg.text;

  await nameCtx.reply("Теперь фамилию");
  const surnameCtx = await convo.waitFor("message:text");
  const surname = surnameCtx.msg.text;

  const reply_markup = new InlineKeyboard()
    .text("Да ✅", "yes")
    .text("Нет ❌", "no");
  await surnameCtx.reply("Ты бесплатник?", { reply_markup });
  const paidCtx = await convo.waitForCallbackQuery(["yes", "no"]);
  const free = paidCtx.callbackQuery.data == "yes";
  await paidCtx.editMessageText(
    `Ты бесплатник?\n\n${free ? "Да ✅" : "Нет ❌"}`,
  );

  const confirmMarkup = new InlineKeyboard()
    .text("Правильно", "ok")
    .row()
    .text("Неправильно", "back");
  await ctx.reply(
    `
Проверь то, что я получил:
Имя: ${nameCtx.msg.text},
Фамилия: ${surnameCtx.msg.text},
Бесплатник: ${free ? "Да ✅" : "Нет ❌"}
`,
    { reply_markup: confirmMarkup },
  );
  const confirmCtx = await convo.waitForCallbackQuery(["ok", "back"]);
  confirmCtx.editMessageText(
    `${confirmCtx.msg?.text}\n\n${
      confirmCtx.callbackQuery.data == "ok" ? "Правильно" : "Неправильно"
    }`,
  );
  if (confirmCtx.callbackQuery.data == "ok") {
    await setProfile(confirmCtx.from.id, name, surname, free);
    await confirmCtx.reply("Профиль создан!");
  } else {
    await confirmCtx.reply("Попробуй еще раз через /register");
  }
};

registryComposer.use(createConversation(register));

registryComposer.chatType("private").command("register", async (ctx) => {
  const profile = await getProfile(ctx.from.id);
  if (profile) {
    await ctx.reply("Ты уже зарегистрирован");
    return;
  }
  await ctx.conversation.enter("register");
});
