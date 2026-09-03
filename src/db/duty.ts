import { kv } from "../mod.ts";
import { isValidUserId } from "./entry.ts";
import { profileMap } from "./profile.ts";

interface Group {
  members: number[];
}

export interface LiveGroup {
  index: number;
  members: number[];
}

const groupKey = (order: number) => ["group", order];

// --- storage ---

export const setGroup = async (order: number, members: number[]) => {
  if (!Number.isInteger(order) || order < 0) return;
  await kv.set(groupKey(order), { members: members.filter(isValidUserId) });
};

export const getGroups = async () =>
  (await Array.fromAsync(kv.list<Group>({ prefix: ["group"] }), (e) => e.value))
    .filter((g) => !!g && Array.isArray(g.members))
    .map((g) => g.members.filter(isValidUserId));

// Walks every remaining key rather than counting up until the first gap, which
// used to leave orphaned groups behind forever.
export const eraseGroups = async (start: number) => {
  for await (const e of kv.list<Group>({ prefix: ["group"] })) {
    const order = Number(e.key[1]);
    if (Number.isInteger(order) && order >= start) await kv.delete(e.key);
  }
};

export const setGroups = async (groups: number[][]) => {
  for (const [i, group] of groups.entries()) await setGroup(i, group);
  await eraseGroups(groups.length);
};

export const setOrder = async (order: number) => {
  if (!Number.isInteger(order) || order < 0) return;
  await kv.set(["order"], order);
};

export const getOrder = async () => (await kv.get<number>(["order"])).value;

const rawOrder = async () => {
  const value = await getOrder();
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
};

// --- queue ---

// The rotation runs over live groups only. A group that is empty, or whose
// members no longer have profiles, drops out of the cycle entirely: on the
// daily step, on manual rolls, and when wrapping past either end.
export const liveGroups = async (): Promise<LiveGroup[]> => {
  const groups = await getGroups();
  const people = await profileMap();
  return groups
    .map((members, index) => ({
      index,
      members: members.filter((id) => people.has(id)),
    }))
    .filter((g) => g.members.length > 0);
};

// Where the stored pointer lands among live groups. If it points at a group
// that died, the next live one takes over.
const positionOf = (live: LiveGroup[], order: number) => {
  const exact = live.findIndex((g) => g.index === order);
  if (exact >= 0) return exact;
  const after = live.findIndex((g) => g.index > order);
  return after >= 0 ? after : 0;
};

export const currentGroup = async (): Promise<LiveGroup | null> => {
  const live = await liveGroups();
  if (live.length === 0) return null;
  return live[positionOf(live, await rawOrder())];
};

export const liveCount = async () => (await liveGroups()).length;

// Moves by `step` live groups, forward or backward, wrapping both ways.
// The double modulo keeps negative steps in range.
export const shiftOrder = async (step: number): Promise<LiveGroup | null> => {
  const live = await liveGroups();
  if (live.length === 0) {
    await setOrder(0);
    return null;
  }
  const size = live.length;
  const from = positionOf(live, await rawOrder());
  const to = (((from + step) % size) + size) % size;
  await setOrder(live[to].index);
  return live[to];
};

export const advanceOrder = async () => await shiftOrder(1);

// --- rendering ---

export const dutyNames = async (members: number[]) => {
  const people = await profileMap();
  return members
    .map((id) => people.get(id))
    .filter((p) => p != null)
    .map((p) => `${p.firstName} ${p.lastName}`);
};

export const dutyText = async (members: number[]) => {
  const names = await dutyNames(members);
  return names.length
    ? `Сегодня дежурят:\n${names.join("\n")}`
    : "Сегодня дежурных нет";
};
