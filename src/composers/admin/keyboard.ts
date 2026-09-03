import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../../mod.ts";
import { isOwner } from "../../owner.ts";
import { getProfile, profileMap } from "../../db/profile.ts";
import { getGroups, setGroups } from "../../db/duty.ts";

export const keyboardComposer = new Composer<BotContext>();

// People buttons per keyboard row. Set to 1 if long names still get cut.
const PER_ROW = 2;
// Telegram will not accept an unbounded keyboard.
const MAX_GROUPS = 40;

// Schedule editing is owner-only.
const owner = keyboardComposer.chatType("private").filter(isOwner);

owner.command("schedule", async (ctx) => {
  const groups = await getGroups();
  const people = await profileMap();

  const schedule = groups.map((group) =>
    group.filter((id) => people.has(id))
  );
  const placed = new Set(schedule.flat());
  schedule.push([...people.keys()].filter((id) => !placed.has(id)));

  ctx.session.schedule = schedule;
  ctx.session.action = undefined;
  await ctx.reply("Здраствуй бро, вот расписание", {
    reply_markup: await makeGroupKeyboard(schedule),
  });
});

// Indices arrive in callback data and cannot be trusted.
const cell = (schedule: number[][], row: unknown, idx: unknown) =>
  typeof row === "number" && typeof idx === "number" &&
  Number.isInteger(row) && Number.isInteger(idx) &&
  row >= 0 && row < schedule.length &&
  idx >= 0 && idx < schedule[row].length;

const rowExists = (schedule: number[][], row: unknown) =>
  typeof row === "number" && Number.isInteger(row) &&
  row >= 0 && row < schedule.length;

owner.callbackQuery(
  [/^[0-9]+-[0-9]+$/, /^add-[0-9]+$/],
  async (ctx) => {
    const schedule = ctx.session.schedule;
    if (!schedule) {
      await ctx.answerCallbackQuery({
        text: "Клавиатура устарела, открой /schedule заново",
        show_alert: true,
      });
      return;
    }

    const action = ctx.callbackQuery.data;
    if (!ctx.session.action) {
      ctx.session.action = action;
      await ctx.answerCallbackQuery({ text: "Выбрано, теперь второй" });
      return;
    }

    const pair = [action.split("-"), ctx.session.action.split("-")];
    ctx.session.action = undefined;

    if (pair[0][0] == "add" && pair[1][0] == "add") {
      await ctx.answerCallbackQuery({ text: "Нужно выбрать человека" });
      return;
    }
    if (pair[0][0] != "add") [pair[0], pair[1]] = [pair[1], pair[0]];

    if (pair[0][0] == "add") {
      const newRow = Number(pair[0][1]);
      const [oldRow, oldIdx] = pair[1].map(Number);
      if (!rowExists(schedule, newRow) || !cell(schedule, oldRow, oldIdx)) {
        await ctx.answerCallbackQuery({
          text: "Клавиатура устарела, открой /schedule заново",
          show_alert: true,
        });
        return;
      }
      schedule[newRow].push(...schedule[oldRow].splice(oldIdx, 1));
    } else {
      const [row1, idx1] = pair[0].map(Number);
      const [row2, idx2] = pair[1].map(Number);
      if (!cell(schedule, row1, idx1) || !cell(schedule, row2, idx2)) {
        await ctx.answerCallbackQuery({
          text: "Клавиатура устарела, открой /schedule заново",
          show_alert: true,
        });
        return;
      }
      [schedule[row1][idx1], schedule[row2][idx2]] = [
        schedule[row2][idx2],
        schedule[row1][idx1],
      ];
    }

    await ctx.editMessageReplyMarkup({
      reply_markup: await makeGroupKeyboard(schedule),
    });
    await ctx.answerCallbackQuery();
  },
);

owner.callbackQuery(/^ins-[0-9]+$/, async (ctx) => {
  const schedule = ctx.session.schedule;
  const rowPos = Number(ctx.callbackQuery.data.split("-")[1]);
  if (!schedule || !rowExists(schedule, rowPos)) {
    await ctx.answerCallbackQuery({ text: "Открой /schedule заново" });
    return;
  }
  if (schedule.length >= MAX_GROUPS) {
    await ctx.answerCallbackQuery({ text: "Слишком много групп" });
    return;
  }
  schedule.splice(rowPos, 0, []);
  ctx.session.action = undefined;
  await ctx.editMessageReplyMarkup({
    reply_markup: await makeGroupKeyboard(schedule),
  });
  await ctx.answerCallbackQuery();
});

// Deleting an empty group.
owner.callbackQuery(/^rm-[0-9]+$/, async (ctx) => {
  const schedule = ctx.session.schedule;
  const rowPos = Number(ctx.callbackQuery.data.split("-")[1]);
  if (!schedule || !rowExists(schedule, rowPos)) {
    await ctx.answerCallbackQuery({ text: "Открой /schedule заново" });
    return;
  }
  if (schedule[rowPos].length) {
    await ctx.answerCallbackQuery({
      text: "Сначала перенеси людей в другую группу",
      show_alert: true,
    });
    return;
  }
  schedule.splice(rowPos, 1);
  ctx.session.action = undefined;
  await ctx.editMessageReplyMarkup({
    reply_markup: await makeGroupKeyboard(schedule),
  });
  await ctx.answerCallbackQuery({ text: "Группа удалена" });
});

owner.callbackQuery("push", async (ctx) => {
  const schedule = ctx.session.schedule;
  if (!schedule) {
    await ctx.answerCallbackQuery({ text: "Открой /schedule заново" });
    return;
  }
  if (schedule.length >= MAX_GROUPS) {
    await ctx.answerCallbackQuery({ text: "Слишком много групп" });
    return;
  }
  schedule.push([]);
  ctx.session.action = undefined;
  await ctx.editMessageReplyMarkup({
    reply_markup: await makeGroupKeyboard(schedule),
  });
  await ctx.answerCallbackQuery();
});

owner.callbackQuery("save", async (ctx) => {
  const schedule = ctx.session.schedule;
  if (!schedule) {
    await ctx.answerCallbackQuery({ text: "Открой /schedule заново" });
    return;
  }
  await setGroups(schedule.filter((e) => e.length));
  ctx.session.schedule = undefined;
  ctx.session.action = undefined;
  await ctx.editMessageReplyMarkup({});
  await ctx.reply("Готово!");
  await ctx.answerCallbackQuery();
});

const makeGroupKeyboard = async (groups: number[][]) => {
  const keyboard = new InlineKeyboard();

  for (const [idx1, group] of groups.entries()) {
    let inRow = 0;
    for (const [idx2, id] of group.entries()) {
      const profile = await getProfile(id);
      if (!profile) continue; // keep idx2 aligned with the stored group
      keyboard.text(
        `${profile.firstName} ${profile.lastName}`,
        `${idx1}-${idx2}`,
      );
      if (++inRow % PER_ROW === 0) keyboard.row();
    }
    if (inRow % PER_ROW !== 0) keyboard.row();

    keyboard.text(`➕ в группу ${idx1 + 1}`, `add-${idx1}`);
    keyboard.text("⬆️ ряд", `ins-${idx1}`);
    if (group.length === 0) keyboard.text("🗑", `rm-${idx1}`);
    keyboard.row();
  }

  keyboard.text("Добавить ряд", "push").row();
  keyboard.text("Сохранить", "save");

  return keyboard;
};
