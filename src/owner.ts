// Никаких импортов в этом файле — он подключается из mod.ts и из композеров,
// и любой импорт превратил бы это в цикл, который падает на старте.
export const OWNER_ID = Number(Deno.env.get("OWNER_ID"));

export const isOwner = (ctx: { from?: { id: number } }) =>
  Number.isSafeInteger(OWNER_ID) && OWNER_ID > 0 && ctx.from?.id === OWNER_ID;
