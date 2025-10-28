import { kv } from "../mod.ts";
import { nanoid } from "nanoid";

export interface Post {
  name: string;
  channel_id: number;
  message_id: number;
  date: Date;
}

export const setPost = async (post: Post) => {
  const postId = nanoid();
  await kv.set(["post", postId], post);
  return postId;
};

export const getPost = async (id: string) =>
  (await kv.get<Post>(["post", id])).value;

export const deletePost = async (id: string) => await kv.delete(["post", id]);
