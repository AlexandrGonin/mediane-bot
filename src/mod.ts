import { DenoKVAdapter } from "storage";
import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";
import {
  channelComposer,
  refreshPosts,
  updatePost,
} from "./composers/channel.ts";
import { entryComposer } from "./composers/entry.ts";
import { registryComposer } from "./composers/registry.ts";
import { utilComposer } from "./composers/admin/util.ts";
import { getAdmin, listChannels, requestPostClose } from "./db/channel.ts";
import { deletePost, getPost, listPosts, Post, setPost } from "./db/post.ts";
import { keyboardComposer } from "./composers/admin/keyboard.ts";
import { getCurrentGroup, increaseOrder } from "./db/duty.ts";
import { getProfile, isBanned } from "./db/profile.ts";

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

export const OWNER_ID = Number(Deno.env.get("OWNER_ID"));
if (!OWNER_ID) {
  console.error("OWNER_ID не задан или невалиден — команды владельца отключены");
}

const BAN_TEXT = "Вы были заблокированы, можете обратиться к администратору";

export const bot = new Bot<BotContext>(Deno.env.get("TOKEN") || "");
export const kv = await Deno.openKv();

bot.use(session({
  initial: () => ({}),
  storage: new DenoKVAdapter(kv),
}));

// бан-фильтр: стоит раньше всех обработчиков, поэтому забаненный
// не может ни зарегистрироваться, ни сменить имя, ни записаться
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

// после любого действия приводим посты в канале в актуальный вид
bot.use(async (ctx, next) => {
  await next();
  try {
    await refreshPosts();
  } catch (err) {
    console.error("refreshPosts:", err);
  }
});

bot.command("cancel", async (ctx) => {
  ctx.session = {};
  await ctx.reply("Действие отменено.");
});

bot.callbackQuery(
  "closed",
  async (ctx) =>
    await ctx.answerCallbackQuery({
      text:
        "🔒 Запись закрыта!\n\nСкорее всего, вышло время, до которого можно было записаться.",
      show_alert: true,
    }),
);

bot.chatType("private").command("stop", async (ctx) => {
  await kv.set(["open"], false);
  await ctx.reply("closed");
});

bot.chatType("private").command("open", async (ctx) => {
  await kv.set(["open"], true);
  await ctx.reply("open");
});

bot.use(keyboardComposer);
bot.use(utilComposer);
bot.use(registryComposer);
bot.use(entryComposer);
bot.use(channelComposer);

// ежедневная публикация: пост записи в столовую + список дежурных
export const dailyPost = async () => {
  const open = (await kv.get<boolean>(["open"])).value;
  if (!open) return;
  const delay = 3 * 60 * 60 * 1000;
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

  for (const channel of await listChannels()) {
    // 1. пост записи в столовую
    try {
      const now = new Date();
      const post = await bot.api.sendMessage(channel.id, "post");
      const postId = await setPost(
        {
          channel_id: channel.id,
          message_id: post.message_id,
          name: `на ${
            now.toLocaleDateString("ru", { timeZone: "Asia/Yekaterinburg" })
          }`,
          date: now,
        } as Post,
      );
      await updatePost(postId);
      await requestPostClose(postId, delay);
      console.log(`channel ${channel.id}: столовая OK`);
    } catch (err) {
      console.error(`channel ${channel.id}: столовая упала:`, err);
    }

    // 2. список дежурных — отдельным try, чтобы не зависеть от первого
    try {
      await new Promise((r) => setTimeout(r, 3000)); // пауза против flood control
      await bot.api.sendMessage(channel.id, text);
      console.log(`channel ${channel.id}: дежурство OK`);
    } catch (err) {
      console.error(`channel ${channel.id}: дежурство упало:`, err);
    }
  }
};

// дни недели числами: Deploy не принимает MON-SAT
Deno.cron("daily entry", "15 2 * * 1-6", dailyPost);

// post closing
export const closePost = async (postId: string) => {
  const post = await getPost(postId);
  if (!post) return;
  const adminId = await getAdmin(post.channel_id);
  if (adminId) {
    await bot.api.forwardMessage(adminId, post.channel_id, post.message_id);
  }

  const reply_markup = new InlineKeyboard().text("🔒 Запись закрыта", "closed");
  await bot.api.editMessageReplyMarkup(post.channel_id, post.message_id, {
    reply_markup,
  });

  await deletePost(postId);
};

// вместо kv.listenQueue: KV Connect на Deno Deploy не поддерживает очереди
Deno.cron("close posts", "*/5 * * * *", async () => {
  const now = Date.now();
  for (const post of await listPosts()) {
    if (!post.closeAt || post.closeAt > now) continue;
    try {
      await closePost(post.id);
      console.log(`post ${post.id}: запись закрыта`);
    } catch (err) {
      console.error(`post ${post.id}: не удалось закрыть:`, err);
    }
  }
});

bot.catch(console.error);
