import { Composer } from "grammy";
import { isAdmin } from "../../db/channel.ts";

const adminComposer = new Composer();

adminComposer.use(async (ctx, next) => {
  if (ctx.chat?.type == "private" && await isAdmin(ctx.chat.id)) {
    await next();
  }
})
