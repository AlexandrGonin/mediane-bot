import { kv } from "../mod.ts";
import { getPost, savePost } from "./post.ts";

export const channelKey = (id: number) => ["channel", id];

export const setChannel = async (id: number, allowed: boolean) =>
  await kv.set(channelKey(id), allowed);

export const checkChannel = async (id: number) =>
  (await kv.get<boolean>(channelKey(id))).value ? true : false;

export const listChannels = async () =>
  (await Array.fromAsync(
    kv.list<boolean>({ prefix: ["channel"] }),
    (e) => ({
      id: Number(e.key[1]),
      isAllowed: e.value,
    }),
  )).filter((c) => c.isAllowed);

// раньше здесь была очередь KV (kv.enqueue), но KV Connect на Deno Deploy
// очереди не поддерживает — просто помечаем пост временем закрытия
export const requestPostClose = async (
  postId: string,
  delay: number,
) => {
  const post = await getPost(postId);
  if (!post) return;
  await savePost(postId, { ...post, closeAt: Date.now() + delay });
};

export const adminKey = (channelId: number) => ["admin", channelId];

export const setAdmin = async (channelId: number, userId: number) =>
  await kv.set(adminKey(channelId), userId);

export const getAdmin = async (
  channelId: number,
) => (await kv.get<number>(adminKey(channelId))).value || 0;

export const isAdmin = async (id: number) => {
  const admins = await Array.fromAsync(
    kv.list<number>({ prefix: ["admin"] }),
    (e) => e.value,
  );
  return admins.includes(id);
};
