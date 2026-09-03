import { Composer, InlineKeyboard } from "grammy";
import { getPost, isClosed, isValidPostId } from "../db/post.ts";
import { getEntry, removeEntry, setEntry } from "../db/entry.ts";
import { updatePost } from "./channel.ts";
import { getProfile } from "../db/profile.ts";

export const entryComposer = new Composer();

const closedKeyboard = new InlineKeyboard().text("🔒 Запись закрыта", "closed");
const CLOSED_ALERT = {
  text:
    "🔒 Запись закрыта!\n\nСкорее всего, вышло время, до которого можно было записаться.",
  show_alert: true,
};
const NOT_REGISTERED =
  "Ты не зарегистрирован в системе! Зарегистрируйся через /register";

entryComposer.chatType("private").command("start", async (ctx) => {
  const postId = ctx.match;
  if (!postId || !isValidPostId(postId)) {
    await ctx.reply("Услышал тебя родной, приходи когда будет запись :)");
    return;
  }

  const profile = await getProfile(ctx.from.id);
  if (!profile) {
    await ctx.reply(NOT_REGISTERED);
    return;
  }

  const post = await getPost(postId);
  if (!post) {
    await ctx.reply("Такой записи уже нет.");
    return;
  }

  const entry = await getEntry(postId, ctx.from.id);

  const reply_markup = new InlineKeyboard();
  if (isClosed(post)) {
    reply_markup.text("Запись закрыта 🔒", "closed");
  } else {
    entry
      ? reply_markup.text("Отменить запись", `remove:${postId}`)
      : reply_markup.text("Записаться", `add:${postId}`);
  }

  await ctx.reply(
    `<b>${entry ? "Записан ✅" : "Не записан 🚫"}</b>\n${post.name}`,
    { parse_mode: "HTML", reply_markup },
  );
});

entryComposer.chatType("private").callbackQuery(/^add:/, async (ctx) => {
  const postId = ctx.callbackQuery.data.slice(4);
  if (!isValidPostId(postId)) {
    await ctx.answerCallbackQuery(CLOSED_ALERT);
    return;
  }

  const post = await getPost(postId);
  if (!post || isClosed(post)) {
    await ctx.editMessageReplyMarkup({ reply_markup: closedKeyboard });
    await ctx.answerCallbackQuery(CLOSED_ALERT);
    return;
  }

  const profile = await getProfile(ctx.from.id);
  if (!profile) {
    await ctx.answerCallbackQuery({ text: NOT_REGISTERED, show_alert: true });
    return;
  }

  const entry = await getEntry(postId, ctx.from.id);
  await setEntry(postId, ctx.from.id);

  // перепроверка: между проверкой выше и записью пост мог закрыться
  const fresh = await getPost(postId);
  if (!fresh || isClosed(fresh)) {
    await removeEntry(postId, ctx.from.id);
    await ctx.editMessageReplyMarkup({ reply_markup: closedKeyboard });
    await ctx.answerCallbackQuery(CLOSED_ALERT);
    return;
  }

  await ctx.editMessageText(
    `<b>Записан ✅</b>\n${post.name}`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text(
        "Отменить запись",
        `remove:${postId}`,
      ),
    },
  );
  await ctx.answerCallbackQuery({ text: "Теперь ты записан." });
  if (!entry) await updatePost(postId);
});

entryComposer.chatType("private").callbackQuery(/^remove:/, async (ctx) => {
  const postId = ctx.callbackQuery.data.slice(7);
  if (!isValidPostId(postId)) {
    await ctx.answerCallbackQuery(CLOSED_ALERT);
    return;
  }

  const post = await getPost(postId);
  if (!post || isClosed(post)) {
    await ctx.editMessageReplyMarkup({ reply_markup: closedKeyboard });
    await ctx.answerCallbackQuery(CLOSED_ALERT);
    return;
  }

  const profile = await getProfile(ctx.from.id);
  if (!profile) {
    await ctx.answerCallbackQuery({ text: NOT_REGISTERED, show_alert: true });
    return;
  }

  const entry = await getEntry(postId, ctx.from.id);
  await removeEntry(postId, ctx.from.id);

  await ctx.editMessageText(
    `<b>Не записан 🚫</b>\n${post.name}`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("Записаться", `add:${postId}`),
    },
  );
  await ctx.answerCallbackQuery({ text: "Ты больше не записан." });
  if (entry) await updatePost(postId);
});
