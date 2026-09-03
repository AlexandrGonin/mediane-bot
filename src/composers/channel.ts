import { Composer, Context, InlineKeyboard } from "grammy";
import { checkChannel, requestPostClose } from "../db/channel.ts";
import { getPost, listPosts, Post, savePost, setPost } from "../db/post.ts";
import { bot } from "../mod.ts";
import { listEntries } from "../db/entry.ts";
import { getProfile, sorting } from "../db/profile.ts";
import { getCurrentGroup, increaseOrder } from "../db/duty.ts";

export const channelComposer = new Composer();

const check = async (ctx: Context) =>
  ctx.chat?.type == "channel" &&
  (await checkChannel(ctx.chat.id));

// bot.botInfo недоступен, пока бот не проинициализирован (например в кроне),
// поэтому имя берём через getMe и кешируем на время жизни изолята
let botName: string | undefined;
const getBotName = async () => botName ??= (await bot.api.getMe()).username;

channelComposer.filter(check).command("post", async (ctx) => {
  const delay = 3 * 60 * 60 * 1000;

  const now = new Date();
  const postId = await setPost({
    channel_id: ctx.chatId,
    message_id: ctx.msgId,
    name: ctx.match ||
      now.toLocaleDateString(
        "ru",
        {
          timeZone: "Asia/Yekaterinburg",
          day: "2-digit",
          month: "long",
          weekday: "long",
        },
      ),
    date: now,
  } as Post);
  await updatePost(postId);
  await requestPostClose(postId, delay);
});

channelComposer.filter(check).command("duty", async (ctx) => {
  const group = (await getCurrentGroup())?.members || [];
  await increaseOrder();
  const profiles =
    (await Array.fromAsync(group.map(async (id) => await getProfile(id))))
      .filter((e) => e !== null);
  const text = `Сегодня дежурят:\n${
    profiles.map((profile) => `${profile.firstName} ${profile.lastName}`).join(
      "\n",
    )
  }`;
  await ctx.editMessageText(text);
});

// единая точка отрисовки поста: не дёргает Telegram, если текст не изменился
export const renderPost = async (id: string, post: Post) => {
  const text = await generatePostText(id);
  if (post.lastText === text) return;

  const reply_markup = post.closed
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

// прогон по всем постам, включая закрытые — они тоже должны быть актуальны
export const refreshPosts = async () => {
  for (const post of await listPosts()) {
    const { id, ...data } = post;
    await renderPost(id, data as Post);
  }
};

export const generatePostText = async (postId: string) => {
  const post = await getPost(postId);
  if (!post) return "";
  const entries = await listEntries(postId);
  const { free, paid } = Object.groupBy(
    entries,
    (profile) => profile.isFree ? "free" : "paid",
  );

  free?.sort(sorting);
  paid?.sort(sorting);

  const listText = [free, paid]
    .filter((l) => l != undefined)
    .map((l) => l.map((p) => `${p.firstName} ${p.lastName}`).join("\n"))
    .join("\n");

  const header = "<b>Столовая</b>\n" + post.name;

  const footer = `${free ? free.length : 0} беспл. + ${
    paid ? paid.length : 0
  } пл.`;

  return [header, listText, footer].filter((e) => e.length).join("\n\n");
};
