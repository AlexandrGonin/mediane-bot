import { kv } from "../mod.ts";
import { isValidUserId } from "./entry.ts";

interface Group {
  members: number[];
}

const groupKey = (order: number) => ["group", order];

export const setGroup = async (order: number, members: number[]) => {
  if (!Number.isInteger(order) || order < 0) return;
  await kv.set(groupKey(order), { members: members.filter(isValidUserId) });
};

export const getGroup = async (order: number) => {
  if (!Number.isInteger(order) || order < 0) return null;
  return (await kv.get<Group>(groupKey(order))).value;
};

export const getGroups = async () =>
  (await Array.fromAsync(kv.list<Group>({ prefix: ["group"] }), (e) => e.value))
    .filter((g) => !!g && Array.isArray(g.members))
    .map((g) => g.members.filter(isValidUserId));

export const eraseGroups = async (start: number) => {
  // идём по всем оставшимся ключам, а не до первой дырки —
  // иначе пропуск в нумерации оставлял бы мусорные группы навсегда
  for await (const e of kv.list<Group>({ prefix: ["group"] })) {
    const order = Number(e.key[1]);
    if (Number.isInteger(order) && order >= start) await kv.delete(e.key);
  }
};

export const setGroups = async (groups: number[][]) => {
  for (const [i, group] of groups.entries()) {
    await setGroup(i, group);
  }
  await eraseGroups(groups.length);
  // указатель мог остаться за пределами нового списка
  const order = await getOrder();
  if (!isSaneOrder(order, groups.length)) await setOrder(0);
};

export const setOrder = async (order: number) => {
  if (!Number.isInteger(order) || order < 0) return;
  await kv.set(["order"], order);
};

export const getOrder = async () => (await kv.get<number>(["order"])).value;

const isSaneOrder = (order: unknown, count: number): order is number =>
  typeof order === "number" && Number.isInteger(order) &&
  order >= 0 && order < count;

const safeOrder = async (count: number) => {
  const raw = await getOrder();
  return isSaneOrder(raw, count) ? raw : 0;
};

export const getCurrentGroup = async () => {
  const groups = await getGroups();
  if (groups.length === 0) return null;
  return { members: groups[await safeOrder(groups.length)] } as Group;
};

export const increaseOrder = async () => {
  const count = (await getGroups()).length;
  // без этой проверки было (order + 1) % 0 = NaN, и ротация умирала навсегда
  if (count === 0) {
    await setOrder(0);
    return;
  }
  await setOrder((await safeOrder(count) + 1) % count);
};
