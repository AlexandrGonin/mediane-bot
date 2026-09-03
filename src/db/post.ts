import { kv } from "../mod.ts";
import { nanoid } from "nanoid";

export interface Post {
  name: string;
  channel_id: number;
  message_id: number;
  date: Date;
  closeAt: number;
  closed?: boolean;
  lastText?: string;
}

// Post ids travel through deep links and callback data, so they arrive as
// untrusted input. nanoid emits 21 chars from [A-Za-z0-9_-].
export const isValidPostId = (id: unknown): id is string =>
  typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);

// The only authority on whether sign-up is still accepted. Deliberately not
// driven by the `closed` flag alone: a cron that runs late, or never, must not
// be able to leave a post open. A missing or malformed closeAt reads as closed.
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
