import { kv } from "../mod.ts";
import { getProfile } from "./profile.ts";

const entryKey = (
  postId: string,
  userId: number,
) => [
  "entry",
  postId,
  userId,
];

export const getEntry = async (postId: string, userId: number) =>
  (await kv.get<true>(entryKey(postId, userId))).value;

export const setEntry = async (postId: string, userId: number) =>
  await kv.set(entryKey(postId, userId), true);

export const removeEntry = async (
  postId: string,
  userId: number,
) => await kv.delete(entryKey(postId, userId));

export const listEntries = async (postId: string) =>
  (await Array.fromAsync(
    kv.list({ prefix: ["entry", postId] }),
    async (e) => await getProfile(Number(e.key[2])),
  )).filter((e) => e != null);
