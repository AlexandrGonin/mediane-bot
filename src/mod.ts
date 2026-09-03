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

if (!OWNER_ID) {
  console.error("OWNER_ID не задан или невалиден — команды владельца отключены");
}

const BAN_TEXT = "Вы были заблокированы, можете обратиться к администратору";
// сколько держим закрытые посты, прежде чем удалить их вместе с записями
const PURGE_AFTER = 3 * 24 * 60 * 60 * 1000;

export const bot = new Bot<BotContext>(Deno.env.get("TOKEN") || "");
export const kv = await Deno.openKv();

// разовая чистка ключей старой схемы прав
purgeLegacyAdmins().catch((err) => console.error("purgeLegacyAdmins:", err));

bot.use(session({
  initial: () => ({}),
  storage: new DenoKVAdapter(kv),
}));

// бан-фильтр стоит раньше всех обработчиков, поэтому забаненный
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

// выключатель автопостинга — тоже только владельцу
bot.chatType("private").filter(isOwner).command("stop", async (ctx) => {
  await kv.set(["open"], false);
  await ctx.reply("closed");
});

bot.chatType("private").filter(isOwner).command("open", async (ctx) => {
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

  const group = (await getCurrentGroup())?.members || [];
  await increaseOrder();
  const profiles =
    (await Array.fromAsync(group.map(async (id) => await getProfile(id))))
      .filter((e) => e !== null);
  const text = profiles.length
    ? `Сегодня дежурят:\n${
      profiles.map((p) => `${p.firstName} ${p.lastName}`).join("\n")
    }`
    : "Сегодня дежурных нет";

  for (const channel of await listChannels()) {
    // 1. пост записи в столовую
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
        // время закрытия ставится сразу при создании — отдельным шагом
        // оно могло не записаться, и запись висела бы открытой вечно
        closeAt: now.getTime() + REG_WINDOW,
      });
      await updatePost(postId);
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

// закрытие записи: пост НЕ удаляется, а помечается закрытым,
// иначе бот теряет над ним контроль и список нельзя починить
export const closePost = async (postId: string) => {
  const post = await getPost(postId);
  if (!post || post.closed) return;

  // итог уходит владельцу и только ему: получателя больше нельзя
  // переназначить через базу, он берётся из OWNER_ID
  if (OWNER_ID) {
    try {
      await bot.api.forwardMessage(OWNER_ID, post.channel_id, post.message_id);
    } catch (err) {
      // не смогли переслать владельцу — это не повод не закрывать запись
      console.error(`post ${postId}: пересылка владельцу не прошла:`, err);
    }
  }

  // lastText сбрасываем, чтобы гарантированно перерисовать с замком
  await savePost(postId, { ...post, closed: true, lastText: undefined });
  await updatePost(postId);
};

// вместо kv.listenQueue: KV Connect на Deno Deploy не поддерживает очереди
Deno.cron("close posts", "*/5 * * * *", async () => {
  for (const post of await listPosts()) {
    try {
      if (!post.closed && isClosed(post)) {
        await closePost(post.id);
        console.log(`post ${post.id}: запись закрыта`);
        continue;
      }
      if (
        post.closed &&
        Date.now() - new Date(post.date).getTime() > PURGE_AFTER
      ) {
        await removeEntries(post.id);
        await deletePost(post.id);
        console.log(`post ${post.id}: удалён из базы`);
      }
    } catch (err) {
      console.error(`post ${post.id}: ошибка обслуживания:`, err);
    }
  }
});

bot.catch((err) => console.error("update", err.ctx?.update?.update_id, err));
