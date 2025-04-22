import { Composer, Context, InlineKeyboard } from "grammy";
import {
  checkChannel,
  getPost,
  requestPostClose,
  setPost,
} from "../db/channel.ts";
import { bot } from "../mod.ts";
import { listEntries } from "../db/entry.ts";
import { sorting } from "../db/profile.ts";

export const channelComposer = new Composer();

const check = async (ctx: Context) =>
  ctx.chat?.type == "channel" &&
  (await checkChannel(ctx.chat.id));

channelComposer.filter(check).command("post", async (c) => {
  const delayToClose = 3 * 60 * 60 * 1000;

  const now = new Date();
  await setPost(c.chatId, now, c.msgId);
  await requestPostClose(c.chatId, now, delayToClose);

  const reply_markup = new InlineKeyboard()
    .url(
      "Запись в боте",
      `https://t.me/${bot.botInfo.username}?start=${c.chatId}`,
    );
  await c.editMessageText(await generatePostText(c.chatId, new Date()), {
    reply_markup,
    parse_mode: "HTML",
  });
});

export const updatePost = async (channelId: number, date: Date) => {
  const post = await getPost(channelId, date);
  if (!post) return;

  const reply_markup = new InlineKeyboard()
    .url(
      "Запись в боте",
      `https://t.me/${bot.botInfo.username}?start=${channelId}`,
    );
  await bot.api.editMessageText(
    channelId,
    post,
    await generatePostText(channelId, date),
    { reply_markup, parse_mode: "HTML" },
  );
};

export const generatePostText = async (channelId: number, date: Date) => {
  const entries = await listEntries(channelId, date);
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

  const header = "<b>Столовая</b>\n" +
    new Date().toLocaleDateString("ru", {
      timeZone: "Asia/Yekaterinburg",
      day: "2-digit",
      month: "long",
      weekday: "long",
    });

  const footer = `${free ? free.length : 0} беспл. + ${
    paid ? paid.length : 0
  } пл.`;

  return [header, listText, footer].filter((e) => e.length).join("\n\n");
};
