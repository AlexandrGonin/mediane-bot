import { DenoKVAdapter } from "storage";
import { Bot, Context, session, SessionFlavor } from "grammy";
import {
  channelComposer,
  refreshPosts,
  REG_WINDOW,
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

// Hard override for the duty list, read from the environment. A KV flag lives
// in one database; if the deployment is ever bound to a different one, or a
// second instance runs with a database of its own, the flag set by /dutyoff is
// simply not there and the list comes back. DUTY=off cannot drift that way.
export const DUTY_ENV_OFF =
  (Deno.env.get("DUTY") ?? "").toLowerCase() === "off";

// Identifies which instance produced a log line or answered /instance.
export const INSTANCE = Deno.env.get("DENO_DEPLOYMENT_ID") ?? "local";

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
bot.use(async (_ctx, next) => {
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

// The duty list has its own switch, independent of the canteen post.
bot.chatType("private").filter(isOwner).command("dutyoff", async (ctx) => {
  await kv.set(["duty"], false);
  await ctx.reply(
    "Дежурства больше не публикуются, столовая продолжает работать.\n" +
      "Очередь стоит на месте. Включить обратно: /dutyon\n\n" +
      (DUTY_ENV_OFF
        ? "DUTY=off задан в окружении — выключено жёстко."
        : "Этот флаг живёт в базе. Чтобы выключить намертво, задай DUTY=off в окружении."),
  );
});

bot.chatType("private").filter(isOwner).command("dutyon", async (ctx) => {
  await kv.set(["duty"], true);
  await ctx.reply("Дежурства снова публикуются");
});

bot.use(keyboardComposer);
bot.use(utilComposer);
bot.use(registryComposer);
bot.use(entryComposer);
bot.use(channelComposer);

// --- scheduled work ---

// Publishes the sign-up post and the duty list, then advances the rotation.
// Calendar day in the business timezone, used to recognise a post as today's.
export const dayStamp = (date: Date) =>
  date.toLocaleDateString("en-CA", { timeZone: TIMEZONE });

// Channels that already have a post for today, so a repeated run is a no-op.
// Deno.cron is at-least-once: a handler that times out or throws is retried,
// and this one is deliberately slow because of the flood-control pauses.
export const channelsPostedToday = async () => {
  const today = dayStamp(new Date());
  return new Set(
    (await listPosts())
      .filter((p) => dayStamp(new Date(p.date)) === today)
      .map((p) => p.channel_id),
  );
};

export const dailyPost = async (force = false) => {
  // Enabled by default; only an explicit /stop turns posting off.
  if ((await kv.get<boolean>(["open"])).value === false) return;

  // The duty list is switched separately, and while it is off the rotation
  // stays put: advancing it would silently skip groups for every day the
  // list was not published.
  const dutyEnabled = !DUTY_ENV_OFF &&
    (await kv.get<boolean>(["duty"])).value !== false;
  const group = dutyEnabled ? (await currentGroup())?.members || [] : [];
  const posted = force ? new Set<number>() : await channelsPostedToday();

  // Advance only if at least one channel is actually going to be posted to,
  // otherwise a retried run would skip a group for nothing.
  const allChannels = await listChannels();
  const pending = allChannels.filter((c) => !posted.has(c.id));
  if (dutyEnabled && group.length && pending.length) await advanceOrder();
  const dutyMessage = dutyEnabled && group.length
    ? await dutyText(group)
    : null;

  for (const channel of allChannels) {
    if (posted.has(channel.id)) {
      console.log(
        `channel ${channel.id}: already posted today, skipped [${INSTANCE}]`,
      );
      continue;
    }
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
      console.log(`channel ${channel.id}: sign-up post ok [${INSTANCE}]`);
    } catch (err) {
      console.error(`channel ${channel.id}: sign-up post failed:`, err);
    }

    if (!dutyMessage) continue;

    // Separate try so a failure above still lets the duty list through.
    try {
      await new Promise((r) => setTimeout(r, 3000)); // avoid flood control
      await bot.api.sendMessage(channel.id, dutyMessage);
      console.log(`channel ${channel.id}: duty list ok [${INSTANCE}]`);
    } catch (err) {
      console.error(`channel ${channel.id}: duty list failed:`, err);
    }
  }
};

// Weekday gating is done here, not in the cron expression. The weekday field
// does not map to the usual 0=Sunday convention on every runtime, and getting
// it wrong shifts the whole week by a day. The cron fires daily and the check
// below decides, using the calendar the posts are actually written for.
export const TIMEZONE = "Asia/Yekaterinburg";
const WORK_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);

export const weekdayIn = (timeZone: string, date = new Date()) =>
  new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);

export const isWorkday = (date = new Date()) =>
  WORK_DAYS.has(weekdayIn(TIMEZONE, date));

Deno.cron("daily entry", "15 2 * * *", async () => {
  const weekday = weekdayIn(TIMEZONE, new Date());
  if (!WORK_DAYS.has(weekday)) {
    console.log(
      `daily entry: ${weekday} is a day off, nothing published [${INSTANCE}]`,
    );
    return;
  }
  await dailyPost();
});

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
Deno.cron("close posts", "*/15 * * * *", async () => {
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
