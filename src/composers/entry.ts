import { Composer, InlineKeyboard } from "grammy";
import { getPost } from "../db/post.ts";
import { getEntry, removeEntry, setEntry } from "../db/entry.ts";
import { updatePost } from "./channel.ts";
import { getProfile } from "../db/profile.ts";

export const entryComposer = new Composer();

const closedKeyboard = new InlineKeyboard().text("🔒 Запись закрыта", "closed");
const closedAlert = {
  text:
    "🔒 Запись закрыта!\n\nСкорее всего, вышло время, до которого можно было записаться.",
  show_alert: true,
};

entryComposer.chatType("private").command("start", async (ctx) => {
  const postId = ctx.match;
  if (!postId) {
    await ctx.reply("Услышал тебя родной, приходи когда будет запись :)");
    return;
  }

  const profile = await getProfile(ctx.from.id);
  if (!profile) {
    await ctx.reply(
      "Ты не зарегистрирован в системе! Зарегистрируйся через /register",
    );
    return;
  }

  const post = await getPost(postId);
  if (!post) return;

  const entry = await getEntry(postId, ctx.from.id);

  const reply_markup = new InlineKeyboard();
  if (!post.closed) {
    entry
      ? reply_markup.text("Отменить запись", `remove:${postId}`)
      : reply_markup.text("Записаться", `add:${postId}`);
  } else {
    reply_markup.text("Запись закрыта 🔒", "closed");
  }

  await ctx.reply(
    `<b>${entry ? "Записан ✅" : "Не записан 🚫"}</b>\n${post.name}`,
    { parse_mode: "HTML", reply_markup },
  );
});

entryComposer.chatType("private").callbackQuery(/add:.*/, async (ctx) => {
  const postId = ctx.callbackQuery.data.split(":")[1];
  if (!postId) {
    await ctx.reply("Услышал тебя родной, приходи когда будет запись :)");
    return;
  }

  const post = await getPost(postId);
  if (!post || post.closed) {
    await ctx.editMessageReplyMarkup({ reply_markup: closedKeyboard });
    await ctx.answerCallbackQuery(closedAlert);
    return;
  }

  const profile = await getProfile(ctx.from.id);
  if (!profile) {
    await ctx.reply(
      "Ты не зарегистрирован в системе! Зарегистрируйся через /register",
    );
    return;
  }

  const entry = await getEntry(postId, ctx.from.id);
  await setEntry(postId, ctx.from.id);

  const reply_markup = new InlineKeyboard().text(
    "Отменить запись",
    `remove:${postId}`,
  );
  await ctx.editMessageText(
    `<b>Записан ✅</b>\n${post.name}`,
    { parse_mode: "HTML", reply_markup },
  );
  await ctx.answerCallbackQuery({ text: "Теперь ты записан." });
  if (!entry) {
    await updatePost(postId);
  }
});

entryComposer.chatType("private").callbackQuery(/remove:.*/, async (ctx) => {
  const postId = ctx.callbackQuery.data.split(":")[1];
  if (!postId) {
    await ctx.reply("Услышал тебя родной, приходи когда будет запись :)");
    return;
  }

  const post = await getPost(postId);
  if (!post || post.closed) {
    await ctx.editMessageReplyMarkup({ reply_markup: closedKeyboard });
    await ctx.answerCallbackQuery(closedAlert);
    return;
  }

  const profile = await getProfile(ctx.from.id);
  if (!profile) {
    await ctx.reply(
      "Ты не зарегистрирован в системе! Зарегистрируйся через /register",
    );
    return;
  }

  const entry = await getEntry(postId, ctx.from.id);
  await removeEntry(postId, ctx.from.id);

  const reply_markup = new InlineKeyboard().text(
    "Записаться",
    `add:${postId}`,
  );
  await ctx.editMessageText(
    `<b>Не записан 🚫</b>\n${post.name}`,
    { parse_mode: "HTML", reply_markup },
  );
  await ctx.answerCallbackQuery({ text: "Ты больше не записан." });
  if (entry) {
    await updatePost(postId);
  }
});
