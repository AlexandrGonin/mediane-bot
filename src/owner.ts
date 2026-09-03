// Single source of admin authority. Kept free of imports on purpose: mod.ts
// and the composers all read it, and any import here would close a cycle that
// crashes on startup.
export const OWNER_ID = Number(Deno.env.get("OWNER_ID"));

export const isOwner = (ctx: { from?: { id: number } }) =>
  Number.isSafeInteger(OWNER_ID) && OWNER_ID > 0 && ctx.from?.id === OWNER_ID;
