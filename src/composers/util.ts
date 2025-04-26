import { Composer } from "grammy";
import { removeEntry } from "../db/entry.ts";
import { channelKey, setAdmin } from "../db/channel.ts";
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

utilComposer.chatType("private").command("set", async (ctx) => {
  if (ctx.match.split(" ").length < 2) return;
  const channelId = Number(ctx.match.split(" ")[0]);
  const userId = Number(ctx.match.split(" ")[1]);
  if (channelId < 0 && userId > 0) {
    await setAdmin(channelId, userId);
    await ctx.react("✍");
  }
});
