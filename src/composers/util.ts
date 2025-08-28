import { Composer } from "grammy";
import { setAdmin, setChannel } from "../db/channel.ts";
import { monthAsText } from "../db/offload.ts";
import { closePost } from "../mod.ts";
import { removeProfile } from "../db/profile.ts";

export const utilComposer = new Composer();

utilComposer.chatType("private").command("remove", async (ctx) => {
  const userId = ctx.from.id;
  await removeProfile(userId);
  await ctx.reply("Removed your profile");
});
// get data for this month
utilComposer.chatType("private").command("data", async (ctx) => {
  const channelId = Number(ctx.match);
  if (ctx.match) {
    await ctx.reply(await monthAsText(channelId, (new Date()).getMonth()));
  } else {
    await ctx.react("🌚");
  }
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
  const channelId = Number(ctx.match);
  if (!channelId) {
    await ctx.react("🌚");
    return;
  }
  const chatMember = await ctx.api.getChatMember(channelId, ctx.from.id);
  const allowedStatuses = ["creator", "administrator"];
  if (!allowedStatuses.includes(chatMember.status)) {
    await ctx.react("🤨");
    return;
  }
  await closePost({ channelId, date: new Date() });
  await ctx.react("👌");
});
