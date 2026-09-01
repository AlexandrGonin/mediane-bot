import { Composer, Context, InlineKeyboard } from "grammy";
import { BotContext } from "../../mod.ts";
import { setAdmin, setChannel } from "../../db/channel.ts";
import { closePost } from "../../mod.ts";
import {
  findByLastName,
  findProfiles,
  getProfile,
  removeProfile,
  setProfile,
} from "../../db/profile.ts";

export const utilComposer = new Composer<BotContext>();

const OWNER_ID = Number(Deno.env.get("OWNER_ID"));
if (!OWNER_ID) {
  console.error("OWNER_ID не задан или невалиден — команда /remove отключена");
}

const isOwner = (ctx: Context) => OWNER_ID > 0 && ctx.from?.id === OWNER_ID;

// всё, что ниже, доступно только владельцу
const owner = utilComposer.chatType("private").filter(isOwner);

owner.command("remove", async (ctx) => {
  const query = ctx.match.trim();
  if (!query) {
    await ctx.reply("Укажи фамилию: /remove Иванов");
    return;
  }

  // на всякий случай оставляем удаление по числовому id
  if (/^\d+$/.test(query)) {
    const id = Number(query);
    const profile = await getProfile(id);
    if (!profile) {
      await ctx.reply(`Профиль с id ${id} не найден`);
      return;
    }
    await removeProfile(id);
    await ctx.reply(`Удалён: ${profile.firstName} ${profile.lastName}`);
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

owner.command("rename", async (ctx) => {
  const parts = ctx.match.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 3) {
    await ctx.reply("Формат: /rename Фамилия НовоеИмя НоваяФамилия");
    return;
  }
  const [query, firstName, lastName] = parts;

  const found = await findProfiles(query);

  if (found.length === 0) {
    await ctx.reply(`Профиль «${query}» не найден`);
    return;
  }

  if (found.length === 1) {
    const p = found[0];
    await setProfile(p.id, firstName, lastName, p.isFree);
    await ctx.reply(`${p.firstName} ${p.lastName} → ${firstName} ${lastName}`);
    return;
  }

  // однофамильцы: имя держим в сессии, в кнопку лезет только id
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
