import { kv } from "../mod.ts";
import { nanoid } from "nanoid";

export interface Post {
  name: string;
  channel_id: number;
  message_id: number;
  date: Date;
  closeAt?: number; // когда закрывать запись, мс epoch
  lastText?: string; // что последний раз отрисовано в канале
}

export const setPost = async (post: Post) => {
  const postId = nanoid();
  await kv.set(["post", postId], post);
  return postId;
};

export const getPost = async (id: string) =>
  (await kv.get<Post>(["post", id])).value;

export const savePost = async (id: string, post: Post) =>
  await kv.set(["post", id], post);

export const listPosts = async () =>
  await Array.fromAsync(
    kv.list<Post>({ prefix: ["post"] }),
    (e) => ({ id: String(e.key[1]), ...e.value }),
  );

export const deletePost = async (id: string) => await kv.delete(["post", id]);
