import { kv } from "../mod.ts";

// Channel and supergroup ids are always negative.
export const isValidChannelId = (id: unknown): id is number =>
  typeof id === "number" && Number.isSafeInteger(id) && id < 0;

export const channelKey = (id: number) => ["channel", id];

export const setChannel = async (id: number, allowed: boolean) => {
  if (!isValidChannelId(id)) return;
  await kv.set(channelKey(id), allowed === true);
};

export const checkChannel = async (id: unknown) => {
  if (!isValidChannelId(id)) return false;
  return (await kv.get<boolean>(channelKey(id))).value === true;
};

export const listChannels = async () =>
  (await Array.fromAsync(
    kv.list<boolean>({ prefix: ["channel"] }),
    (e) => ({ id: Number(e.key[1]), isAllowed: e.value }),
  )).filter((c) => isValidChannelId(c.id) && c.isAllowed === true);

// Admin rights are no longer stored anywhere: OWNER_ID is the only source.
// An earlier scheme kept ["admin", channelId] = userId, writable by anyone
// through /set. This clears whatever is left of it.
export const purgeLegacyAdmins = async () => {
  let removed = 0;
  for await (const e of kv.list({ prefix: ["admin"] })) {
    await kv.delete(e.key);
    removed++;
  }
  if (removed) console.log(`removed stale admin keys: ${removed}`);
};
