import { kv } from "../mod.ts";
import { nanoid } from "nanoid";

export interface Post {
  name: string;
  channel_id: number;
  message_id: number;
  date: Date;
  closeAt: number; // обязательное: момент, после которого запись не принимается
  closed?: boolean; // замок уже повешен кроном
  lastText?: string; // что последний раз отрисовано в канале
}

// id поста приходит из deep-link и callback_data, то есть напрямую от юзера.
// nanoid по умолчанию 21 символ из [A-Za-z0-9_-].
export const isValidPostId = (id: unknown): id is string =>
  typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);

// ЕДИНСТВЕННАЯ правда о том, открыта ли запись.
// Не полагается на флаг closed: если крон опоздал или не отработал,
// время всё равно решает. Битый/отсутствующий closeAt = закрыто.
export const isClosed = (post: Post) =>
  post.closed === true ||
  !(typeof post.closeAt === "number" && post.closeAt > Date.now());

export const setPost = async (post: Post) => {
  const postId = nanoid();
  await kv.set(["post", postId], post);
  return postId;
};

export const getPost = async (id: unknown) => {
  if (!isValidPostId(id)) return null;
  return (await kv.get<Post>(["post", id])).value;
};

export const savePost = async (id: string, post: Post) => {
  if (!isValidPostId(id)) return;
  await kv.set(["post", id], post);
};

export const listPosts = async () =>
  (await Array.fromAsync(
    kv.list<Post>({ prefix: ["post"] }),
    (e) => ({ id: String(e.key[1]), ...e.value }),
  )).filter((p) => isValidPostId(p.id) && typeof p.channel_id === "number");

export const deletePost = async (id: string) => {
  if (!isValidPostId(id)) return;
  await kv.delete(["post", id]);
};
