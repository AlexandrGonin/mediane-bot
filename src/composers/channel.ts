import { Composer, Context, InlineKeyboard } from "grammy";
import { checkChannel, requestPostClose } from "../db/channel.ts";
import { getPost, Post, setPost } from "../db/post.ts";
import { bot } from "../mod.ts";
import { listEntries } from "../db/entry.ts";
import { getProfile, sorting } from "../db/profile.ts";
import { getCurrentGroup, increaseOrder } from "../db/duty.ts";

export const channelComposer = new Composer();

const check = async (ctx: Context) =>
  ctx.chat?.type == "channel" &&
  (await checkChannel(ctx.chat.id));

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
  await requestPostClose(postId, delay);
  const reply_markup = new InlineKeyboard()
    .url(
      "Запись в боте",
      `https://t.me/${bot.botInfo.username}?start=${postId}`,
    );
  await ctx.editMessageText(await generatePostText(postId), {
    reply_markup,
    parse_mode: "HTML",
  });
});

channelComposer.filter(check).command("duty", async (ctx) => {
  const group = (await getCurrentGroup())?.members || []; 
  await increaseOrder();
  const profiles = (await Array.fromAsync(group.map(async (id) => await getProfile(id)))).filter((e) => e !== null);
  const text = `Сегодня дежурят:\n${profiles.map((profile) => `${profile.firstName} ${profile.lastName}`).join('\n')}`
  await ctx.editMessageText(text);
});

export const updatePost = async (postId: string) => {
  const post = await getPost(postId);
  if (!post) return;

  const reply_markup = new InlineKeyboard()
    .url(
      "Запись в боте",
      `https://t.me/${bot.botInfo.username}?start=${postId}`,
    );
  await bot.api.editMessageText(
    post.channel_id,
    post.message_id,
    await generatePostText(postId),
    { reply_markup, parse_mode: "HTML" },
  );
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
