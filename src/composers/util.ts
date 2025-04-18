import { Composer } from "grammy";
import { removeEntry } from "../db/entry.ts";
import { channelKey } from "../db/channel.ts";
import { monthAsText } from "../db/offload.ts";
import { kv } from "../mod.ts";
import { updatePost } from "./channel.ts";

export const utilComposer = new Composer();

// get data for this month
utilComposer.chatType("private").command("data", async (ctx) => {
  const channelId = Number(ctx.match);
  if (ctx.match) {
    await ctx.reply(await monthAsText(channelId));
  } else {
    await ctx.react("🌚");
  }
});

utilComposer.chatType("private").command("rm", async (ctx) => {
  const [channelId, profileId] = ctx.match.split(" ").map(Number);
  if (channelId && profileId) {
    await removeEntry(channelId, profileId, new Date());
    await updatePost(channelId, new Date());
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
    await ctx.reply(`Канал с ID ${channelId} добавлен в разрешенные`);
  } else {
    await ctx.reply("Неправильный ID канала");
  }
});
