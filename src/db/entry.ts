import { kv } from "../mod.ts";
import { isValidPostId } from "./post.ts";

export const isValidUserId = (id: unknown): id is number =>
  typeof id === "number" && Number.isSafeInteger(id) && id > 0;

const entryKey = (postId: string, userId: number) => ["entry", postId, userId];

const valid = (postId: unknown, userId: unknown) =>
  isValidPostId(postId) && isValidUserId(userId);

export const getEntry = async (postId: string, userId: number) => {
  if (!valid(postId, userId)) return null;
  return (await kv.get<true>(entryKey(postId, userId))).value;
};

export const setEntry = async (postId: string, userId: number) => {
  if (!valid(postId, userId)) return;
  await kv.set(entryKey(postId, userId), true);
};

export const removeEntry = async (postId: string, userId: number) => {
  if (!valid(postId, userId)) return;
  await kv.delete(entryKey(postId, userId));
};

export const removeEntries = async (postId: string) => {
  if (!isValidPostId(postId)) return;
  for await (const e of kv.list({ prefix: ["entry", postId] })) {
    await kv.delete(e.key);
  }
};

// Returns ids only; callers resolve profiles from a single preloaded map
// instead of one lookup per signed-up person.
export const listEntryIds = async (postId: string) => {
  if (!isValidPostId(postId)) return [];
  return (await Array.fromAsync(
    kv.list({ prefix: ["entry", postId] }),
    (e) => Number(e.key[2]),
  )).filter(isValidUserId);
};
