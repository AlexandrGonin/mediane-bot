import { kv } from "../mod.ts";

export const channelKey = (id: number) => ["channel", id];

export const checkChannel = async (id: number) =>
  (await kv.get<boolean>(channelKey(id))).value ? true : false;

const postKey = (
  channelId: number,
  date: Date,
) => [
  "post",
  channelId,
  date.toLocaleDateString("ru", { timeZone: "Asia/Yekaterinburg" }),
];

export const getPost = async (channelId: number, date: Date) =>
  (await kv.get<number>(postKey(channelId, date))).value;

export const setPost = async (
  channelId: number,
  date: Date,
  messageId: number,
) => await kv.set(postKey(channelId, date), messageId);

export const deletePost = async (channelId: number, date: Date) =>
  await kv.delete(postKey(channelId, date));

export const requestPostClose = async (
  channelId: number,
  date: Date,
  delay: number,
) => await kv.enqueue({ channelId, date }, { delay });

export const listChannels = async () =>
  (await Array.fromAsync(
    kv.list<boolean>({ prefix: ["channel"] }),
    (e) => ({
      id: Number(e.key[1]),
      isAllowed: e.value,
    }),
  )).filter((c) => c.isAllowed);

export const adminKey = (channelId: number) => ["admin", channelId];

export const setAdmin = async (channelId: number, userId: number) =>
  await kv.set(adminKey(channelId), userId);

export const getAdmin = async (
  channelId: number,
) => (await kv.get<number>(adminKey(channelId))).value || 0;
