import { kv } from "../mod.ts";

interface Group {
  members: number[];
}

const groupKey = (order: number) => ["group", order];

export const setGroup = async (order: number, members: number[]) =>
  await kv.set(groupKey(order), { members } as Group);

export const getGroup = async (order: number) =>
  (await kv.get<Group>(groupKey(order))).value;

export const getGroups = async () =>
  (await Array.fromAsync(kv.list<Group>({ prefix: ["group"] }), (e) => e.value)).map((group) => group.members);

export const eraseGroups = async (start: number) => {
  for (let order = start; (await kv.get<Group>(groupKey(order))).versionstamp; order++) {
    await kv.delete(groupKey(order));
  }
}

export const setGroups = async (groups: number[][]) => {
  for (const [i, group] of groups.entries()) {
    await setGroup(i, group);
  }
  await eraseGroups(groups.length);
}

export const setOrder = async (order: number) => await kv.set(["order"], order)
export const getOrder = async () => (await kv.get<number>(["order"])).value;

export const getCurrentGroup = async () => await getGroup(await getOrder() || 0);

export const increaseOrder = async () => {
  const order = await getOrder() || 0;
  const groupCount = (await getGroups()).length;
  const newOrder = (order + 1) % groupCount;
  await setOrder(newOrder);
}