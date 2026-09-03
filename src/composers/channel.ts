import { Composer, Context, InlineKeyboard } from "grammy";
import { checkChannel } from "../db/channel.ts";
import {
  getPost,
  isClosed,
  listPosts,
  Post,
  savePost,
  setPost,
} from "../db/post.ts";
import { bot } from "../mod.ts";
import { listEntryIds } from "../db/entry.ts";
import { getProfile, Profile, profileMap, sorting } from "../db/profile.ts";
import { getCurrentGroup, increaseOrder } from "../db/duty.ts";

export const channelComposer = new Composer();

// сколько времени принимается запись
export const REG_WINDOW = 3 * 60 * 60 * 1000;
// у Telegram лимит сообщения 4096 символов; с запасом на служебные вставки
const MAX_TEXT = 3900;
const MAX_POST_NAME = 100;

const check = async (ctx: Context) =>
  ctx.chat?.type == "channel" &&
  (await checkChannel(ctx.chat.id));

// bot.botInfo недоступен, пока бот не проинициализирован (например в кроне),
// поэтому имя берём через getMe и кешируем на время жизни изолята
let botName: string | undefined;
const getBotName = async () => botName ??= (await bot.api.getMe()).username;

// имена вводит пользователь, а пост уходит с parse_mode: HTML.
// без экранирования один "&" в фамилии ломает пост навсегда.
const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

channelComposer.filter(check).command("post", async (ctx) => {
  const now = new Date();
  const name = (ctx.match || "").trim().replace(/\s+/gu, " ").slice(
    0,
    MAX_POST_NAME,
  ) ||
    now.toLocaleDateString(
      "ru",
      {
        timeZone: "Asia/Yekaterinburg",
        day: "2-digit",
        month: "long",
        weekday: "long",
      },
    );

  // closeAt проставляется СРАЗУ при создании: отдельным шагом он мог
  // не записаться, и тогда запись висела бы открытой вечно
  const postId = await setPost({
    channel_id: ctx.chatId,
    message_id: ctx.msgId,
    name,
    date: now,
    closeAt: now.getTime() + REG_WINDOW,
  });
  await updatePost(postId);
});

channelComposer.filter(check).command("duty", async (ctx) => {
  const group = (await getCurrentGroup())?.members || [];
  await increaseOrder();
  const profiles =
    (await Array.fromAsync(group.map(async (id) => await getProfile(id))))
      .filter((e) => e !== null);
  if (profiles.length === 0) {
    await ctx.editMessageText("Сегодня дежурных нет");
    return;
  }
  await ctx.editMessageText(
    `Сегодня дежурят:\n${
      profiles.map((p) => `${p.firstName} ${p.lastName}`).join("\n")
    }`,
  );
});

// единая точка отрисовки поста: не дёргает Telegram, если текст не изменился
export const renderPost = async (
  id: string,
  post: Post,
  profiles?: Map<number, Profile>,
) => {
  const text = await generatePostText(id, profiles);
  if (!text || post.lastText === text) return;

  const reply_markup = isClosed(post)
    ? new InlineKeyboard().text("🔒 Запись закрыта", "closed")
    : new InlineKeyboard().url(
      "Запись в боте",
      `https://t.me/${await getBotName()}?start=${id}`,
    );

  try {
    await bot.api.editMessageText(
      post.channel_id,
      post.message_id,
      text,
      { reply_markup, parse_mode: "HTML" },
    );
    await savePost(id, { ...post, lastText: text });
  } catch (err) {
    console.error(`post ${id}: обновление не прошло:`, err);
  }
};

export const updatePost = async (postId: string) => {
  const post = await getPost(postId);
  if (!post) return;
  await renderPost(postId, post);
};

// прогон по всем постам, включая закрытые — они тоже должны быть актуальны.
// профили грузим ОДИН раз на весь проход, а не по одному на человека
export const refreshPosts = async () => {
  const posts = await listPosts();
  if (posts.length === 0) return;
  const profiles = await profileMap();
  for (const post of posts) {
    const { id, ...data } = post;
    await renderPost(id, data as Post, profiles);
  }
};

export const generatePostText = async (
  postId: string,
  profiles?: Map<number, Profile>,
) => {
  const post = await getPost(postId);
  if (!post) return "";

  const map = profiles ?? await profileMap();
  const entries = (await listEntryIds(postId))
    .map((id) => map.get(id))
    .filter((p) => p != null);

  const { free, paid } = Object.groupBy(
    entries,
    (profile) => profile.isFree ? "free" : "paid",
  );

  free?.sort(sorting);
  paid?.sort(sorting);

  const listText = [free, paid]
    .filter((l) => l != undefined)
    .map((l) =>
      l.map((p) => escapeHtml(`${p.firstName} ${p.lastName}`)).join("\n")
    )
    .join("\n");

  const header = "<b>Столовая</b>\n" + escapeHtml(post.name);

  const footer = `${free ? free.length : 0} беспл. + ${
    paid ? paid.length : 0
  } пл.`;

  const text = [header, listText, footer].filter((e) => e.length).join("\n\n");
  // если список разросся, лучше обрезать, чем получить вечную ошибку
  // "message is too long" и потерять управление постом
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…` : text;
};
