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
import { Profile, profileMap, sorting } from "../db/profile.ts";
import { currentGroup, dutyText } from "../db/duty.ts";

export const channelComposer = new Composer();

// How long sign-up stays open after a post is published.
export const REG_WINDOW = 3 * 60 * 60 * 1000;

// Telegram caps a message at 4096 characters; leave room for the trailer.
const MAX_TEXT = 3900;
const MAX_POST_NAME = 100;

const check = async (ctx: Context) =>
  ctx.chat?.type == "channel" && (await checkChannel(ctx.chat.id));

// bot.botInfo is unavailable until the bot is initialised, which is not
// guaranteed inside a cron run, so the username comes from getMe and is
// cached for the life of the isolate.
let botName: string | undefined;
const getBotName = async () => botName ??= (await bot.api.getMe()).username;

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// --- channel commands ---

channelComposer.filter(check).command("post", async (ctx) => {
  const now = new Date();
  const name =
    (ctx.match || "").trim().replace(/\s+/gu, " ").slice(0, MAX_POST_NAME) ||
    now.toLocaleDateString("ru", {
      timeZone: "Asia/Yekaterinburg",
      day: "2-digit",
      month: "long",
      weekday: "long",
    });

  // closeAt is written together with the post. As a separate follow-up write
  // it could silently fail, leaving sign-up open forever.
  const postId = await setPost({
    channel_id: ctx.chatId,
    message_id: ctx.msgId,
    name,
    date: now,
    closeAt: now.getTime() + REG_WINDOW,
  });
  await updatePost(postId);
});

// Read-only: the rotation is advanced by the daily cron and by /roll, never
// by displaying it.
channelComposer.filter(check).command("duty", async (ctx) => {
  const group = (await currentGroup())?.members || [];
  await ctx.editMessageText(await dutyText(group));
});

// --- rendering ---

// Single place that writes a post to Telegram. Skips the API call entirely
// when the rendered text has not changed.
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
    await bot.api.editMessageText(post.channel_id, post.message_id, text, {
      reply_markup,
      parse_mode: "HTML",
    });
    await savePost(id, { ...post, lastText: text });
  } catch (err) {
    console.error(`post ${id}: update failed:`, err);
  }
};

export const updatePost = async (postId: string) => {
  const post = await getPost(postId);
  if (!post) return;
  await renderPost(postId, post);
};

// Runs after every update. Closed posts are included so that bans and profile
// removals keep them accurate. Profiles are loaded once for the whole pass.
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

  // Truncating beats a permanent "message is too long" that would leave the
  // post unmanageable.
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…` : text;
};
