import { Composer, InlineKeyboard } from "grammy";
import { BotContext, closePost, dailyPost, OWNER_ID } from "../../mod.ts";
import { setAdmin, setChannel } from "../../db/channel.ts";
import { listPosts } from "../../db/post.ts";
import { removeEntry } from "../../db/entry.ts";
import {
  Ban,
  findBansByLastName,
  findByLastName,
  getProfile,
  listBans,
  removeBan,
  removeProfile,
  setBan,
  setProfile,
} from "../../db/profile.ts";

export const utilComposer = new Composer<BotContext>();

const isOwner = (ctx: BotContext) => OWNER_ID > 0 && ctx.from?.id === OWNER_ID;

// всё, что висит на owner, доступно только владельцу бота
const owner = utilComposer.chatType("private").filter(isOwner);

// снимаем человека со всех открытых записей
const dropEntries = async (userId: number) => {
  for (const post of await listPosts()) {
    await removeEntry(post.id, userId);
  }
};

// ---------- баны ----------

owner.command("ban", async (ctx) => {
  const query = ctx.match.trim();
  if (!query) {
    await ctx.reply("Укажи фамилию: /ban Иванов");
    return;
  }

  const found = await findByLastName(query);

  if (found.length === 0) {
    await ctx.reply(`Профиль с фамилией «${query}» не найден`);
    return;
  }

  if (found.length === 1) {
    await banUser(found[0].id, found[0].firstName, found[0].lastName);
    await ctx.reply(`Заблокирован: ${found[0].firstName} ${found[0].lastName}`);
    return;
  }

  const reply_markup = new InlineKeyboard();
  for (const p of found) {
    reply_markup.text(`${p.firstName} ${p.lastName}`, `ban:${p.id}`).row();
  }
  reply_markup.text("Отмена", "ban:cancel");
  await ctx.reply(
    `Нашёл несколько (${found.length}) — кого заблокировать?`,
    { reply_markup },
  );
});

const banUser = async (id: number, firstName: string, lastName: string) => {
  await setBan(id, {
    firstName,
    lastName,
    at: new Date().toISOString(),
  } as Ban);
  await dropEntries(id); // чтобы не висел в сегодняшнем списке
};

owner.callbackQuery(/^ban:/, async (ctx) => {
  const arg = ctx.callbackQuery.data.slice(4);

  if (arg === "cancel") {
    await ctx.editMessageText("Отменено");
    await ctx.answerCallbackQuery();
    return;
  }

  const id = Number(arg);
  if (id === OWNER_ID) {
    await ctx.answerCallbackQuery({
      text: "Владельца заблокировать нельзя",
      show_alert: true,
    });
    return;
  }

  const profile = await getProfile(id);
  if (!profile) {
    await ctx.editMessageText("Профиль уже удалён");
    await ctx.answerCallbackQuery();
    return;
  }

  await banUser(id, profile.firstName, profile.lastName);
  await ctx.editMessageText(
    `Заблокирован: ${profile.firstName} ${profile.lastName}`,
  );
  await ctx.answerCallbackQuery({ text: "Готово" });
});

owner.command("unban", async (ctx) => {
  const query = ctx.match.trim();
  if (!query) {
    await ctx.reply("Укажи фамилию: /unban Иванов");
    return;
  }

  const found = await findBansByLastName(query);

  if (found.length === 0) {
    await ctx.reply(`В бане нет никого с фамилией «${query}»`);
    return;
  }

  for (const b of found) {
    await removeBan(b.id);
  }
  await ctx.reply(
    `Разблокирован${found.length > 1 ? "ы" : ""}:\n${
      found.map((b) => `${b.firstName} ${b.lastName}`).join("\n")
    }`,
  );
});

owner.command("banlist", async (ctx) => {
  const bans = await listBans();
  if (bans.length === 0) {
    await ctx.reply("Забаненных нет");
    return;
  }
  const lines = bans.map((b) =>
    `${b.firstName} ${b.lastName} — ${
      new Date(b.at).toLocaleDateString("ru", {
        timeZone: "Asia/Yekaterinburg",
      })
    }`
  );
  await ctx.reply(`Заблокированы (${bans.length}):\n${lines.join("\n")}`);
});

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
    await dropEntries(found[0].id);
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
  await dropEntries(id);
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
