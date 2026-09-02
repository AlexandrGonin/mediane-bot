import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../../mod.ts";
import { getIds, getProfile } from "../../db/profile.ts";
import { getGroups, setGroups } from "../../db/duty.ts";

export const keyboardComposer = new Composer<BotContext>();

// сколько кнопок с людьми помещать в один ряд клавиатуры
// поставь 1, если длинные имена всё ещё обрезаются
const PER_ROW = 2;

keyboardComposer.chatType("private").command("schedule", async (ctx) => {
  ctx.session.schedule = await getGroups();
  const people = await getIds();
  ctx.session.schedule = ctx.session.schedule.map((group) =>
    group.filter((id) => people.includes(id))
  );
  const newcomers = people.filter((id) =>
    ctx.session.schedule?.map((group) => group.includes(id)).every((b) => !b)
  );
  ctx.session.schedule.push(newcomers);
  if (ctx.session.schedule.length == 0) {
    ctx.session.schedule.push(await getIds());
  }
  const reply_markup = await makeGroupKeyboard(ctx.session.schedule);
  await ctx.reply("Здраствуй бро, вот расписание", { reply_markup });
});

keyboardComposer.chatType("private").callbackQuery(
  [/[0-9]+-[0-9]+/, /add-[0-9]+/],
  async (ctx) => {
    const action = ctx.callbackQuery.data;
    if (!ctx.session.action) {
      ctx.session.action = action;
      await ctx.answerCallbackQuery({ text: "Выбрано, теперь второй" });
      return;
    }
    const actionPair = [action.split("-"), ctx.session.action.split("-")];
    ctx.session.action = undefined;
    if (!ctx.session.schedule) return;
    if (actionPair[0][0] == "add" && actionPair[1][0] == "add") return;
    if (actionPair[0][0] != "add") {
      [actionPair[0], actionPair[1]] = [actionPair[1], actionPair[0]];
    }
    if (actionPair[0][0] == "add") {
      const newRow = Number(actionPair[0][1]);
      const [oldRow, oldIdx] = actionPair[1].map(Number);
      const id = ctx.session.schedule[oldRow].splice(oldIdx, 1);
      ctx.session.schedule[newRow].push(...id);
    } else {
      const [row1, idx1] = actionPair[0].map(Number);
      const [row2, idx2] = actionPair[1].map(Number);
      [ctx.session.schedule[row1][idx1], ctx.session.schedule[row2][idx2]] = [
        ctx.session.schedule[row2][idx2],
        ctx.session.schedule[row1][idx1],
      ];
    }
    const reply_markup = await makeGroupKeyboard(ctx.session.schedule);
    await ctx.editMessageReplyMarkup({ reply_markup });
    await ctx.answerCallbackQuery();
  },
);

keyboardComposer.chatType("private").callbackQuery(
  /ins-[0-9]+/,
  async (ctx) => {
    if (!ctx.session.schedule) return;
    const rowPos = Number(ctx.callbackQuery.data.split("-")[1]);
    ctx.session.schedule.splice(rowPos, 0, []);
    const reply_markup = await makeGroupKeyboard(ctx.session.schedule);
    await ctx.editMessageReplyMarkup({ reply_markup });
    ctx.session.action = undefined;
    await ctx.answerCallbackQuery();
  },
);

// удаление пустой группы
keyboardComposer.chatType("private").callbackQuery(
  /rm-[0-9]+/,
  async (ctx) => {
    if (!ctx.session.schedule) return;
    const rowPos = Number(ctx.callbackQuery.data.split("-")[1]);
    if (ctx.session.schedule[rowPos]?.length) {
      await ctx.answerCallbackQuery({
        text: "Сначала перенеси людей в другую группу",
        show_alert: true,
      });
      return;
    }
    ctx.session.schedule.splice(rowPos, 1);
    ctx.session.action = undefined;
    const reply_markup = await makeGroupKeyboard(ctx.session.schedule);
    await ctx.editMessageReplyMarkup({ reply_markup });
    await ctx.answerCallbackQuery({ text: "Группа удалена" });
  },
);

keyboardComposer.chatType("private").callbackQuery("push", async (ctx) => {
  if (!ctx.session.schedule) return;
  ctx.session.schedule.push([]);
  const reply_markup = await makeGroupKeyboard(ctx.session.schedule);
  await ctx.editMessageReplyMarkup({ reply_markup });
  ctx.session.action = undefined;
  await ctx.answerCallbackQuery();
});

keyboardComposer.chatType("private").callbackQuery("save", async (ctx) => {
  if (!ctx.session.schedule) return;
  ctx.session.schedule = ctx.session.schedule.filter((e) => e.length);
  await setGroups(ctx.session.schedule);
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
      if (!profile) continue; // idx2 остаётся индексом в исходной группе
      keyboard.text(
        `${profile.firstName} ${profile.lastName}`,
        `${idx1}-${idx2}`,
      );
      if (++inRow % PER_ROW === 0) keyboard.row();
    }
    if (inRow % PER_ROW !== 0) keyboard.row();

    // строка управления группой — она же визуальный разделитель
    keyboard.text(`➕ в группу ${idx1 + 1}`, `add-${idx1}`);
    keyboard.text("⬆️ ряд", `ins-${idx1}`);
    if (group.length === 0) keyboard.text("🗑", `rm-${idx1}`);
    keyboard.row();
  }

  keyboard.text("Добавить ряд", "push").row();
  keyboard.text("Сохранить", "save");

  return keyboard;
};
