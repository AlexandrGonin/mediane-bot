import { Composer, InlineKeyboard } from "grammy";
import { BotContext, closePost, dailyPost } from "../../mod.ts";
import { setAdmin, setChannel } from "../../db/channel.ts";
import {
  findByLastName,
  getProfile,
  removeProfile,
  setProfile,
} from "../../db/profile.ts";

export const utilComposer = new Composer<BotContext>();

const OWNER_ID = Number(Deno.env.get("OWNER_ID"));
if (!OWNER_ID) {
  console.error(
    "OWNER_ID не задан или невалиден — /remove, /rename и /cron отключены",
  );
}

const isOwner = (ctx: BotContext) => OWNER_ID > 0 && ctx.from?.id === OWNER_ID;

// всё, что висит на owner, доступно только владельцу бота
const owner = utilComposer.chatType("private").filter(isOwner);

// ---------- удаление профиля ----------

owner.command("remove", async (ctx) => {
  const query = ctx.match.trim();
  if (!query) {
    await ctx.reply("Укажи фамилию: /remove Иванов");
    return;
  }

  const found = await findByLastName(query);

  if (found.length === 0) {
    await ctx.reply(`Профиль с фамилией «${query}» не найден`);
    return;
  }

  if (found.length === 1) {
    await removeProfile(found[0].id);
    await ctx.reply(`Удалён: ${found[0].firstName} ${found[0].lastName}`);
    return;
  }

  const reply_markup = new InlineKeyboard();
  for (const p of found) {
    reply_markup.text(`${p.firstName} ${p.lastName}`, `del:${p.id}`).row();
  }
  reply_markup.text("Отмена", "del:cancel");
  await ctx.reply(
    `Нашёл несколько (${found.length}) — кого удалить?`,
    { reply_markup },
  );
});

owner.callbackQuery(/^del:/, async (ctx) => {
  const arg = ctx.callbackQuery.data.slice(4);

  if (arg === "cancel") {
    await ctx.editMessageText("Отменено");
    await ctx.answerCallbackQuery();
    return;
  }

  const id = Number(arg);
  const profile = await getProfile(id);
  if (!profile) {
    await ctx.editMessageText("Профиль уже удалён");
    await ctx.answerCallbackQuery();
    return;
  }

  await removeProfile(id);
  await ctx.editMessageText(`Удалён: ${profile.firstName} ${profile.lastName}`);
  await ctx.answerCallbackQuery({ text: "Готово" });
});

// ---------- переименование профиля ----------

owner.command("rename", async (ctx) => {
  const parts = ctx.match.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 3) {
    await ctx.reply("Формат: /rename Фамилия НовоеИмя НоваяФамилия");
    return;
  }
  const [query, firstName, lastName] = parts;

  const found = await findByLastName(query);

  if (found.length === 0) {
    await ctx.reply(`Профиль с фамилией «${query}» не найден`);
    return;
  }

  if (found.length === 1) {
    const p = found[0];
    await setProfile(p.id, firstName, lastName, p.isFree);
    await ctx.reply(`${p.firstName} ${p.lastName} → ${firstName} ${lastName}`);
    return;
  }

  // однофамильцы: новое имя держим в сессии, в кнопку лезет только id
  // (у callback_data лимит 64 байта, кириллица — 2 байта на символ)
  ctx.session.rename = { firstName, lastName };
  const reply_markup = new InlineKeyboard();
  for (const p of found) {
    reply_markup.text(`${p.firstName} ${p.lastName}`, `ren:${p.id}`).row();
  }
  reply_markup.text("Отмена", "ren:cancel");
  await ctx.reply(
    `Нашёл несколько (${found.length}) — кого переименовать в «${firstName} ${lastName}»?`,
    { reply_markup },
  );
});

owner.callbackQuery(/^ren:/, async (ctx) => {
  const arg = ctx.callbackQuery.data.slice(4);
  const pending = ctx.session.rename;
  ctx.session.rename = undefined;

  if (arg === "cancel") {
    await ctx.editMessageText("Отменено");
    await ctx.answerCallbackQuery();
    return;
  }

  if (!pending) {
    await ctx.editMessageText("Забыл, на что переименовывать — повтори /rename");
    await ctx.answerCallbackQuery();
    return;
  }

  const id = Number(arg);
  const profile = await getProfile(id);
  if (!profile) {
    await ctx.editMessageText("Профиль уже удалён");
    await ctx.answerCallbackQuery();
    return;
  }

  await setProfile(id, pending.firstName, pending.lastName, profile.isFree);
  await ctx.editMessageText(
    `${profile.firstName} ${profile.lastName} → ${pending.firstName} ${pending.lastName}`,
  );
  await ctx.answerCallbackQuery({ text: "Готово" });
});

// ---------- отладка крона (убрать после проверки) ----------

owner.command("cron", async (ctx) => {
  await ctx.reply("Запускаю крон вручную…");
  await dailyPost();
  await ctx.reply("Отработал, смотри логи");
});

// ---------- остальное, как было ----------

// add channel to approved list
utilComposer.chatType("private").command("add", async (ctx) => {
  const channelId = Number(ctx.match);
  if (channelId) {
    await setChannel(channelId, true);
    await ctx.reply(`Канал с ID ${channelId} добавлен в разрешенные`);
  } else {
    await ctx.reply("Неправильный ID канала");
  }
});

utilComposer.chatType("private").command("set", async (ctx) => {
  if (ctx.match.split(" ").length < 2) return;
  const channelId = Number(ctx.match.split(" ")[0]);
  const userId = Number(ctx.match.split(" ")[1]);
  if (channelId < 0 && userId > 0) {
    await setAdmin(channelId, userId);
    await ctx.react("✍");
  }
});

utilComposer.chatType("private").command("close", async (ctx) => {
  const postId = ctx.match;
  if (!postId) {
    await ctx.react("🌚");
    return;
  }

  await closePost(postId);
  await ctx.react("👌");
});
