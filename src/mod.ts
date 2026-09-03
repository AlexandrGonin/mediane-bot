import { DenoKVAdapter } from "storage";
import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";
import {
  channelComposer,
  REG_WINDOW,
  refreshPosts,
  updatePost,
} from "./composers/channel.ts";
import { entryComposer } from "./composers/entry.ts";
import { registryComposer } from "./composers/registry.ts";
import { utilComposer } from "./composers/admin/util.ts";
import { keyboardComposer } from "./composers/admin/keyboard.ts";
import { isOwner, OWNER_ID } from "./owner.ts";
import { listChannels, purgeLegacyAdmins } from "./db/channel.ts";
import {
  deletePost,
  getPost,
  isClosed,
  listPosts,
  savePost,
  setPost,
} from "./db/post.ts";
import { removeEntries } from "./db/entry.ts";
import { advanceOrder, currentGroup, dutyText } from "./db/duty.ts";
import { isBanned } from "./db/profile.ts";

export enum RegStatus {
  name,
  surname,
}

export interface SessionData {
  status?: RegStatus;
  name?: string;
  surname?: string;
  isFree?: boolean;
  cardId?: number;
  schedule?: number[][];
  action?: string;
  rename?: { firstName: string; lastName: string };
}

export type BotContext = Context & SessionFlavor<SessionData>;

if (!OWNER_ID) {
  console.error("OWNER_ID is unset or invalid — owner commands are disabled");
}

const BAN_TEXT = "Вы были заблокированы, можете обратиться к администратору";

// How long a closed post is kept before it and its entries are deleted.
const PURGE_AFTER = 3 * 24 * 60 * 60 * 1000;

export const bot = new Bot<BotContext>(Deno.env.get("TOKEN") || "");
export const kv = await Deno.openKv();

purgeLegacyAdmins().catch((err) => console.error("purgeLegacyAdmins:", err));

bot.use(session({ initial: () => ({}), storage: new DenoKVAdapter(kv) }));

// --- middleware ---

// Runs ahead of every handler, so a banned user cannot register, rename
// themselves or sign up.
bot.use(async (ctx, next) => {
  const id = ctx.from?.id;
  if (!id || id === OWNER_ID) {
    await next();
    return;
  }
  if (!await isBanned(id)) {
    await next();
    return;
  }
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: BAN_TEXT, show_alert: true });
  } else if (ctx.chat?.type === "private") {
    await ctx.reply(BAN_TEXT);
  }
});

// Keeps channel posts in sync after any action. refreshPosts skips the API
// call when nothing changed, so ordinary traffic costs no Telegram requests.
bot.use(async (ctx, next) => {
  await next();
  try {
    await refreshPosts();
  } catch (err) {
    console.error("refreshPosts:", err);
  }
});

// --- top-level handlers ---

bot.command("cancel", async (ctx) => {
  ctx.session = {};
  await ctx.reply("Действие отменено.");
});

bot.callbackQuery("closed", async (ctx) =>
  await ctx.answerCallbackQuery({
    text:
      "🔒 Запись закрыта!\n\nСкорее всего, вышло время, до которого можно было записаться.",
    show_alert: true,
  }));

bot.chatType("private").filter(isOwner).command("stop", async (ctx) => {
  await kv.set(["open"], false);
  await ctx.reply("Автопостинг выключен. Включить обратно: /open");
});

bot.chatType("private").filter(isOwner).command("open", async (ctx) => {
  await kv.set(["open"], true);
  await ctx.reply("Автопостинг включён");
});

bot.use(keyboardComposer);
bot.use(utilComposer);
bot.use(registryComposer);
bot.use(entryComposer);
bot.use(channelComposer);

// --- scheduled work ---

// Publishes the sign-up post and the duty list, then advances the rotation.
export const dailyPost = async () => {
  // Enabled by default; only an explicit /stop turns posting off.
  if ((await kv.get<boolean>(["open"])).value === false) return;

  const group = (await currentGroup())?.members || [];
  await advanceOrder();
  const text = await dutyText(group);

  for (const channel of await listChannels()) {
    try {
      const now = new Date();
      const post = await bot.api.sendMessage(channel.id, "post");
      const postId = await setPost({
        channel_id: channel.id,
        message_id: post.message_id,
        name: `на ${
          now.toLocaleDateString("ru", { timeZone: "Asia/Yekaterinburg" })
        }`,
        date: now,
        closeAt: now.getTime() + REG_WINDOW,
      });
      await updatePost(postId);
      console.log(`channel ${channel.id}: sign-up post ok`);
    } catch (err) {
      console.error(`channel ${channel.id}: sign-up post failed:`, err);
    }

    // Separate try so a failure above still lets the duty list through.
    try {
      await new Promise((r) => setTimeout(r, 3000)); // avoid flood control
      await bot.api.sendMessage(channel.id, text);
      console.log(`channel ${channel.id}: duty list ok`);
    } catch (err) {
      console.error(`channel ${channel.id}: duty list failed:`, err);
    }
  }
};

// Numeric weekdays: Deno Deploy rejects MON-SAT.
Deno.cron("daily entry", "15 2 * * 1-6", dailyPost);

// Marks the post closed instead of deleting it, so bans and profile removals
// can still correct the published list afterwards.
export const closePost = async (postId: string) => {
  const post = await getPost(postId);
  if (!post || post.closed) return;

  if (OWNER_ID) {
    try {
      await bot.api.forwardMessage(OWNER_ID, post.channel_id, post.message_id);
    } catch (err) {
      console.error(`post ${postId}: forward to owner failed:`, err);
    }
  }

  // Clearing lastText forces the re-render that swaps in the lock button.
  await savePost(postId, { ...post, closed: true, lastText: undefined });
  await updatePost(postId);
};

// Replaces kv.enqueue/listenQueue: KV Connect on Deno Deploy has no queues.
Deno.cron("close posts", "*/5 * * * *", async () => {
  for (const post of await listPosts()) {
    try {
      if (!post.closed && isClosed(post)) {
        await closePost(post.id);
        console.log(`post ${post.id}: closed`);
        continue;
      }
      if (
        post.closed &&
        Date.now() - new Date(post.date).getTime() > PURGE_AFTER
      ) {
        await removeEntries(post.id);
        await deletePost(post.id);
        console.log(`post ${post.id}: purged`);
      }
    } catch (err) {
      console.error(`post ${post.id}: maintenance failed:`, err);
    }
  }
});

bot.catch((err) => console.error("update", err.ctx?.update?.update_id, err));
