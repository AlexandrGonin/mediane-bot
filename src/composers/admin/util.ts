import { Composer } from "grammy";
import { setAdmin, setChannel } from "../../db/channel.ts";
import { closePost } from "../../mod.ts";
import { removeProfile } from "../../db/profile.ts";

export const utilComposer = new Composer();

utilComposer.chatType("private").command("remove", async (ctx) => {
  const userId = ctx.from.id;
  await removeProfile(userId);
  await ctx.reply("Removed your profile");
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
