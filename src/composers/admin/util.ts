import { Composer, InlineKeyboard } from "grammy";
import { BotContext, closePost, dailyPost } from "../../mod.ts";
import { isOwner, OWNER_ID } from "../../owner.ts";
import { isValidChannelId, setChannel } from "../../db/channel.ts";
import { isValidPostId, listPosts } from "../../db/post.ts";
import { isValidUserId, removeEntry } from "../../db/entry.ts";
import { currentGroup, dutyNames, liveGroups, shiftOrder } from "../../db/duty.ts";
import {
  Ban,
  cleanName,
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

// Every command below is gated on OWNER_ID. Nothing in the database can grant
// these rights.
const owner = utilComposer.chatType("private").filter(isOwner);

const MAX_STEP = 1000;

const dropEntries = async (userId: number) => {
  for (const post of await listPosts()) await removeEntry(post.id, userId);
};

const parseId = (raw: string) => {
  const id = Number(raw);
  return isValidUserId(id) ? id : null;
};

const parseStep = (raw: string) => {
  const value = raw.trim();
  if (!value) return 1;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_STEP ? n : null;
};

// --- duty queue ---

const describeGroup = async () => {
  const live = await liveGroups();
  if (live.length === 0) return "Живых групп нет — заполни /schedule";
  const group = await currentGroup();
  if (!group) return "Живых групп нет — заполни /schedule";
  const position = live.findIndex((g) => g.index === group.index) + 1;
  const names = await dutyNames(group.members);
  return `Следующими дежурят (группа ${position} из ${live.length}):\n${
    names.join("\n")
  }`;
};

owner.command("current", async (ctx) => {
  await ctx.reply(await describeGroup());
});

owner.command("roll", async (ctx) => {
  const step = parseStep(ctx.match);
  if (step === null) {
    await ctx.reply(`Формат: /roll <число от 0 до ${MAX_STEP}>`);
    return;
  }
  await shiftOrder(step);
  await ctx.reply(`Прокрутил на ${step}.\n\n${await describeGroup()}`);
});

owner.command("rollback", async (ctx) => {
  const step = parseStep(ctx.match);
  if (step === null) {
    await ctx.reply(`Формат: /rollback <число от 0 до ${MAX_STEP}>`);
    return;
  }
  await shiftOrder(-step);
  await ctx.reply(`Отмотал на ${step}.\n\n${await describeGroup()}`);
});

// --- bans ---

const banUser = async (id: number, firstName: string, lastName: string) => {
  await setBan(id, { firstName, lastName, at: new Date().toISOString() } as Ban);
  await dropEntries(id);
};

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
    if (found[0].id === OWNER_ID) {
      await ctx.reply("Владельца заблокировать нельзя");
      return;
    }
    await banUser(found[0].id, found[0].firstName, found[0].lastName);
    await ctx.reply(`Заблокирован: ${found[0].firstName} ${found[0].lastName}`);
    return;
  }

  const reply_markup = new InlineKeyboard();
  for (const p of found) {
    reply_markup.text(`${p.firstName} ${p.lastName}`, `ban:${p.id}`).row();
  }
  reply_markup.text("Отмена", "ban:cancel");
  await ctx.reply(`Нашёл несколько (${found.length}) — кого заблокировать?`, {
    reply_markup,
  });
});

owner.callbackQuery(/^ban:/, async (ctx) => {
  const arg = ctx.callbackQuery.data.slice(4);
  if (arg === "cancel") {
    await ctx.editMessageText("Отменено");
    await ctx.answerCallbackQuery();
    return;
  }

  const id = parseId(arg);
  if (id === null) {
    await ctx.answerCallbackQuery({ text: "Некорректная кнопка" });
    return;
  }
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

  for (const b of found) await removeBan(b.id);
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
      new Date(b.at).toLocaleDateString("ru", { timeZone: "Asia/Yekaterinburg" })
    }`
  );
  await ctx.reply(`Заблокированы (${bans.length}):\n${lines.join("\n")}`);
});

// --- profiles ---

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
  await ctx.reply(`Нашёл несколько (${found.length}) — кого удалить?`, {
    reply_markup,
  });
});

owner.callbackQuery(/^del:/, async (ctx) => {
  const arg = ctx.callbackQuery.data.slice(4);
  if (arg === "cancel") {
    await ctx.editMessageText("Отменено");
    await ctx.answerCallbackQuery();
    return;
  }

  const id = parseId(arg);
  if (id === null) {
    await ctx.answerCallbackQuery({ text: "Некорректная кнопка" });
    return;
  }

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

owner.command("rename", async (ctx) => {
  const parts = ctx.match.trim().split(/\s+/u).filter(Boolean);
  if (parts.length !== 3) {
    await ctx.reply("Формат: /rename Фамилия НовоеИмя НоваяФамилия");
    return;
  }
  const [query, rawFirst, rawLast] = parts;

  const firstName = cleanName(rawFirst);
  const lastName = cleanName(rawLast);
  if (!firstName || !lastName) {
    await ctx.reply("Имя и фамилия — до 32 символов, без команд");
    return;
  }

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

  // Namesakes: the new name goes to the session because callback data is
  // capped at 64 bytes and Cyrillic costs two per character.
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

  const id = parseId(arg);
  if (id === null) {
    await ctx.answerCallbackQuery({ text: "Некорректная кнопка" });
    return;
  }

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

// --- channels and posts ---

owner.command("add", async (ctx) => {
  const channelId = Number(ctx.match.trim());
  if (!isValidChannelId(channelId)) {
    await ctx.reply("Неправильный ID канала (должен быть отрицательным)");
    return;
  }
  await setChannel(channelId, true);
  await ctx.reply(`Канал с ID ${channelId} добавлен в разрешенные`);
});

owner.command("close", async (ctx) => {
  const postId = ctx.match.trim();
  if (!isValidPostId(postId)) {
    await ctx.react("🌚");
    return;
  }
  await closePost(postId);
  await ctx.react("👌");
});

// Publishes the same thing the morning cron does, including the queue step.
owner.command("cron", async (ctx) => {
  await ctx.reply("Публикую как утренний крон…");
  await dailyPost();
  await ctx.reply(
    `Готово. Очередь сдвинулась на 1 — вернуть можно /rollback 1\n\n${await describeGroup()}`,
  );
});
