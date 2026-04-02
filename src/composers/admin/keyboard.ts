import { Composer, InlineKeyboard } from "grammy"
import { BotContext } from "../../mod.ts";
import { getProfile, getIds } from "../../db/profile.ts";
import { getGroups, setGroups } from "../../db/duty.ts";


export const keyboardComposer = new Composer<BotContext>();

keyboardComposer.chatType("private").command("schedule", async (ctx) => {
  ctx.session.schedule = await getGroups();
  if (ctx.session.schedule.length == 0) ctx.session.schedule.push(await getIds());
  const reply_markup = await makeGroupKeyboard(ctx.session.schedule);
  await ctx.reply("Здраствуй бро, вот расписание", { reply_markup });
});

keyboardComposer.chatType("private").callbackQuery([/[0-9]+-[0-9]+/, /add-[0-9]+/], async (ctx) => {
  const action = ctx.callbackQuery.data;
  if (!ctx.session.action) {
    ctx.session.action = action;
    return;
  }
  const actionPair = [action.split("-"), ctx.session.action.split("-")];
  ctx.session.action = undefined;
  if (!ctx.session.schedule) return;
  if (actionPair[0][0] == "add" && actionPair[1][0] == "add") return;
  if (actionPair[0][0] != "add") [actionPair[0], actionPair[1]] = [actionPair[1], actionPair[0]];
  if (actionPair[0][0] == "add") {
    const newRow = Number(actionPair[0][1]);
    const [oldRow, oldIdx] = actionPair[1].map(Number);
    const id = ctx.session.schedule[oldRow].splice(oldIdx, 1);
    ctx.session.schedule[newRow].push(...id);
  } else {
    const [row1, idx1] = actionPair[0].map(Number);
    const [row2, idx2] = actionPair[1].map(Number);
    [ctx.session.schedule[row1][idx1], ctx.session.schedule[row2][idx2]] 
    = [ctx.session.schedule[row2][idx2], ctx.session.schedule[row1][idx1]];
  }
  const reply_markup = await makeGroupKeyboard(ctx.session.schedule);
  await ctx.editMessageReplyMarkup({ reply_markup });
});

keyboardComposer.chatType("private").callbackQuery(/ins-[0-9]+/, async (ctx) => {
  if (!ctx.session.schedule) return;
  const rowPos = Number(ctx.callbackQuery.data.split("-")[1]);
  ctx.session.schedule.splice(rowPos, 0, []);
  const reply_markup = await makeGroupKeyboard(ctx.session.schedule);
  await ctx.editMessageReplyMarkup({ reply_markup });
  ctx.session.action = undefined;
});

keyboardComposer.chatType("private").callbackQuery("push", async (ctx) => {
  if (!ctx.session.schedule) return;
  ctx.session.schedule.push([]);
  const reply_markup = await makeGroupKeyboard(ctx.session.schedule);
  await ctx.editMessageReplyMarkup({ reply_markup });
  ctx.session.action = undefined;
});

keyboardComposer.chatType('private').callbackQuery("save", async (ctx) => {
  if (!ctx.session.schedule) return;
  ctx.session.schedule = ctx.session.schedule.filter((e) => e.length);
  await setGroups(ctx.session.schedule);
  await ctx.editMessageReplyMarkup({});
  await ctx.reply("Готово!");
})

const makeGroupKeyboard = async (groups: number[][]) => {
  const profiles = await Array.fromAsync(groups.map(async (list) => (await Array.fromAsync(list.map(async (id) => await getProfile(id)))).filter((e) => (e !== null))));
  const buttons = profiles.map(
    (group, idx1) => group
      .map((profile, idx2) => [`${profile.lastName}`, `${idx1}-${idx2}`])
      .concat([['+', `add-${idx1}`], ['⬆️', `ins-${idx1}`]])
      .map(([label, tag]) => InlineKeyboard.text(label, tag))
  ).concat([[InlineKeyboard.text("Добавить ряд", "push")], [InlineKeyboard.text("Сохранить", "save")]]);
  return InlineKeyboard.from(buttons);
}