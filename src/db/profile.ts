import { kv } from "../mod.ts";
import { isValidUserId } from "./entry.ts";

export interface Profile {
  firstName: string;
  lastName: string;
  isFree: boolean;
}

export interface Ban {
  firstName: string;
  lastName: string;
  at: string;
}

const profileKey = (id: number) => ["profile", id];
const banKey = (id: number) => ["ban", id];

export const MAX_NAME = 32;

export const normalizeName = (s: string) => s.trim().toLocaleLowerCase("ru");

// приводим ввод пользователя к безопасному виду; null = ввод не годится
export const cleanName = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  const value = raw.replace(/\s+/gu, " ").trim();
  if (value.length === 0 || value.length > MAX_NAME) return null;
  if (value.startsWith("/")) return null;
  return value;
};

const isProfile = (p: unknown): p is Profile =>
  !!p && typeof (p as Profile).firstName === "string" &&
  typeof (p as Profile).lastName === "string";

export const getProfile = async (id: unknown) => {
  if (!isValidUserId(id)) return null;
  const value = (await kv.get<Profile>(profileKey(id))).value;
  return isProfile(value) ? value : null;
};

export const setProfile = async (
  id: number,
  firstName: string,
  lastName: string,
  isFree: boolean,
) => {
  if (!isValidUserId(id)) return;
  await kv.set(
    profileKey(id),
    { firstName, lastName, isFree: isFree === true } as Profile,
  );
};

export const removeProfile = async (id: number) => {
  if (!isValidUserId(id)) return;
  await kv.delete(profileKey(id));
};

export const listProfiles = async () =>
  (await Array.fromAsync(
    kv.list<Profile>({ prefix: ["profile"] }),
    (e) => ({ id: Number(e.key[1]), value: e.value }),
  ))
    .filter((e) => isValidUserId(e.id) && isProfile(e.value))
    .map((e) => ({ id: e.id, ...e.value }));

export const getIds = async () => (await listProfiles()).map((p) => p.id);

// профили одним запросом — чтобы не делать N обращений на каждую перерисовку
export const profileMap = async () =>
  new Map((await listProfiles()).map((p) => [p.id, p as Profile]));

// ищем ТОЛЬКО по фамилии — иначе фамилию вида "2" не найти
export const findByLastName = async (lastName: string) => {
  const needle = normalizeName(lastName);
  if (!needle) return [];
  return (await listProfiles()).filter(
    (p) => normalizeName(p.lastName) === needle,
  );
};

export const sorting = (profile1: Profile, profile2: Profile) => {
  return (profile1.lastName != profile2.lastName)
    ? profile1.lastName.localeCompare(profile2.lastName)
    : profile1.firstName.localeCompare(profile2.firstName);
};

// ---------- баны ----------

export const isBanned = async (id: unknown) => {
  if (!isValidUserId(id)) return false;
  return (await kv.get<Ban>(banKey(id))).value !== null;
};

export const setBan = async (id: number, ban: Ban) => {
  if (!isValidUserId(id)) return;
  await kv.set(banKey(id), ban);
};

export const removeBan = async (id: number) => {
  if (!isValidUserId(id)) return;
  await kv.delete(banKey(id));
};

export const listBans = async () =>
  (await Array.fromAsync(
    kv.list<Ban>({ prefix: ["ban"] }),
    (e) => ({ id: Number(e.key[1]), value: e.value }),
  ))
    .filter((e) => isValidUserId(e.id) && !!e.value)
    .map((e) => ({ id: e.id, ...e.value }));

// ищем по списку банов, а не по профилям: профиль мог быть удалён
export const findBansByLastName = async (lastName: string) => {
  const needle = normalizeName(lastName);
  if (!needle) return [];
  return (await listBans()).filter((b) => normalizeName(b.lastName) === needle);
};
