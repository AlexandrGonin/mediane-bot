import { Composer } from "grammy";
import { removeEntry } from "../db/entry.ts";
import { channelKey } from "../db/channel.ts";
import { monthAsText } from "../db/offload.ts";
import { profilesToIds } from "../db/profile.ts";
import { kv } from "../mod.ts";

const utilComposer = new Composer();

// get data for this month
utilComposer.chatType("private").command("data", async (ctx) => {
  const channelId = Number(ctx.match);
  if (ctx.match) {
    await ctx.reply(await monthAsText(channelId));
  } else {
    await ctx.react("🌚");
  }
});

utilComposer.chatType("private").command("profiles", async (ctx) => {
  await ctx.reply(await profilesToIds());
});

utilComposer.chatType("private").command("rm", async (ctx) => {
  const [channelId, profileId] = ctx.match.split(" ").map(Number);
  if (channelId && profileId) {
    await removeEntry(channelId, profileId, new Date());
    await ctx.react("👌");
  } else {
    await ctx.react("🌚");
  }
});

// add channel to approved list
utilComposer.chatType("private").command("add", async (ctx) => {
  const channelId = Number(ctx.match);
  if (channelId) {
    await kv.set(channelKey(channelId), true);
    await ctx.reply(`Канал с ID ${ctx.match} добавлен в разрешенные`);
  } else {
    await ctx.reply("Неправильный ID канала");
  }
});
