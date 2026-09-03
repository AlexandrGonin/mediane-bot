import { kv } from "../mod.ts";
import { isValidUserId } from "./entry.ts";

// у каналов и супергрупп id всегда отрицательный
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
    (e) => ({
      id: Number(e.key[1]),
      isAllowed: e.value,
    }),
  )).filter((c) => isValidChannelId(c.id) && c.isAllowed === true);

export const adminKey = (channelId: number) => ["admin", channelId];

export const setAdmin = async (channelId: number, userId: number) => {
  if (!isValidChannelId(channelId) || !isValidUserId(userId)) return;
  await kv.set(adminKey(channelId), userId);
};

export const getAdmin = async (channelId: unknown) => {
  if (!isValidChannelId(channelId)) return 0;
  const value = (await kv.get<number>(adminKey(channelId))).value;
  return isValidUserId(value) ? value : 0;
};

export const isAdmin = async (id: unknown) => {
  if (!isValidUserId(id)) return false;
  const admins = await Array.fromAsync(
    kv.list<number>({ prefix: ["admin"] }),
    (e) => e.value,
  );
  return admins.includes(id);
};
